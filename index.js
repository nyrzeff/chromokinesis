#!/usr/bin/env node

import fs from "fs";
import { converter, interpolate, formatHex, formatRgb, formatHsl, parse } from "culori";
import { readFile } from "node:fs/promises";
import { intro, outro, text, select, multiselect } from "@clack/prompts";

async function readJsonFile(path) {
  try {
    const data = await readFile(path, { encoding: "utf-8" });
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error reading file: ${err.message}`);
  }
}

function format(colorOutputFormat) {
  if (colorOutputFormat === "hex")
    return formatHex;
  else if (colorOutputFormat === "rgb")
    return formatRgb;
  else if (colorOutputFormat === "hsl")
    return formatHsl;
}

async function generateVariants(hex, hueVariants, amountOfColors, mixAmount, colorOutputFormat) {
  const oklch = converter("oklch");

  const hue = oklch(hex);
  const result = {
    hue: formatHex(hue),
  };

  const blend = (base, mix, mixAmount) => interpolate([base, mix])(mixAmount);

  const mixColors = {
    tints: parse("oklch(1 0 0)"),
    shades: parse("oklch(0 0 0)"),
    tones: parse("oklch(0.5 0 0)"),
  };

  result["tints"] = "";
  result["shades"] = "";
  result["tones"] = "";

  for (let i = 1; i < amountOfColors; i++) {
    for (const variant of hueVariants) {
      const mixed = blend(hue, mixColors[variant], mixAmount * i);
      if (i < amountOfColors - 1)
        result[variant] += `${format(colorOutputFormat)(mixed)} `;
      else
        result[variant] += `${format(colorOutputFormat)(mixed)}`;
    }
  }
  return result;
};

async function generate(amountOfColors, mixAmount) {
  const allColors = {};

  for (const [name, hex] of Object.entries(baseColors)) {
    console.log(`Generating variants for ${name}`);
    allColors[name] = await generateVariants(hex, hueVariants, amountOfColors, mixAmount, colorOutputFormat);
    console.log(allColors[name]);
  }

  const replacer = (key, value) => {
    return value === "" ? undefined : value;
  };

  fs.writeFileSync("custom-palette.json", JSON.stringify(allColors, replacer, 2));
  outro("✅ Your color variants are available in custom-palette.json");
}

intro("chromokinesis");

const colorsPath = await text({
  message: "Specify the path to the colors file",
  placeholder: "./colors.json",
  initialValue: "colors.json",
  validate(value) {
    if (value.length === 0) return "Path is mandatory";
  },
});

const baseColors = await readJsonFile(colorsPath);

const colorOutputFormat = await select({
  message: "Select the color output format",
  options: [
    { value: "hex", label: "Hex" },
    { value: "rgb", label: "RGB" },
    { value: "hsl", label: "HSL" },
  ],
  required: true,
});

const hueVariants = await multiselect({
  message: "Select the variants you wish to generate",
  options: [
    { value: "tints", label: "Tints" },
    { value: "tones", label: "Tones" },
    { value: "shades", label: "Shades" },
  ],
  required: true,
});

const calculationMethod = await select({
  message: "Pick a calculation method",
  options: [
    { value: "mixAmount", label: "Calculate according to the amount to mix" },
    { value: "amountOfColors", label: "Calculate according to the total amount of colors" },
  ],
});

let amountOfColors, mixAmount;

switch (calculationMethod) {
  case "mixAmount": {
    const mixAmount = await text({
      message: "Specify the amount to mix (0-1)",
      placeholder: "Not sure? Use the initial value to test it out",
      initialValue: 0.3,
      validate(value) {
        if (value <= 0 || value >= 1) return "Mix amount has to be greater than 0 and less than 1";
      },
    });

    amountOfColors = 1 / (mixAmount);
    generate(amountOfColors, mixAmount);
    break;
  }
  case "amountOfColors": {
    const amountOfColors = await text({
      message: "Specify the amount of colors you want in your palette",
      placeholder: "...",
      initialValue: 7,
      validate(value) {
        if (value < 2 || value > 10) return "Amount of colors has to be between 2 and 10";
      },
    });

    mixAmount = Math.round((1 / (amountOfColors)) * 10) / 10;
    generate(amountOfColors, mixAmount);
    break;
  }
}
