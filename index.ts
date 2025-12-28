#!/usr/bin/env node

import fs from "fs";
import { readFile } from "node:fs/promises";

import {
    converter,
    interpolate,
    formatHex,
    formatRgb,
    formatHsl,
    parse
} from "culori";

import {
    intro,
    outro,
    text,
    select,
    multiselect
} from "@clack/prompts";

type ColorFormatType = "hex" | "rgb" | "hsl";

async function readJsonFile(path: string): Promise<any> {
    try {
        const data = await readFile(path, { encoding: "utf-8" });
        return JSON.parse(data);
    } catch (err: any) {
        console.error(`Error reading file: ${err.message}`);
    }
}

function format(colorOutputFormat: ColorFormatType): any {
    if (colorOutputFormat === "hex")
        return formatHex;
    else if (colorOutputFormat === "rgb")
        return formatRgb;
    else if (colorOutputFormat === "hsl")
        return formatHsl;
}

async function generateVariants(
    hex: string,
    hueVariants: string[],
    amountOfColors: number,
    mixAmount: number,
    colorOutputFormat: ColorFormatType,
) {
    const oklch = converter("oklch");

    const hue: any = oklch(hex);
    const formattedHue = formatHex(hue);

    const result = new Map<string, string>();

    // const result = {
    //     hue: formattedHue,
    // };

    const blend = (base: string, mix: number, mixAmount: number) =>
        interpolate([base, mix])(mixAmount);

    // add proper type
    const mixColors = new Map<string, any>();

    mixColors.set("tints", parse("oklch(1 0 0)"));
    mixColors.set("shades", parse("oklch(0 0 0)"));
    mixColors.set("tones", parse("oklch(0.5 0 0)"));

    result.set("tints", "");
    result.set("shades", "");
    result.set("tones", "");

    // result["tints"] = "";
    // result["shades"] = "";
    // result["tones"] = "";

    for (let i = 1; i < amountOfColors; i++) {
        for (const variant of hueVariants) {
            const mixed =
                blend(hue, mixColors.get(variant), mixAmount * i);

            const formatted = format(colorOutputFormat)(mixed);

            if (i < amountOfColors - 1) {
                let value = result.get(variant);
                result.set(variant, value += formatted);
            }
            else {
                // console.log("Idk");
            }
        }
    }
    return result;
};

async function generate(
    amountOfColors: number,
    mixAmount: number
): Promise<void> {
    const colorMap = new Map<string, Map<string, string>>();

    for (const [name, hex] of Object.entries(baseColors)) {
        console.log(`Generating variants for ${name}`);
        const variants = await generateVariants(
            hex as string,
            hueVariants,
            amountOfColors,
            mixAmount,
            colorOutputFormat
        );

        console.log(variants);

        colorMap.set(name, variants);
    }

    console.log("COLORMAP");
    console.log(colorMap);

    const replacer = (_: unknown, value: string) => {
        return value === "" ? undefined : value;
    };

    const allColors = Object.fromEntries(colorMap);

    // TODO: replace hardcoded path
    fs.writeFileSync(
        "/home/nyrzeff/chromokinesis/custom-palette.json",
        JSON.stringify(allColors, replacer, 2));

    outro("✅ Your color variants are available in custom-palette.json");
}

intro("chromokinesis");

const colorsPath = await text({
    message: "Specify the path to the colors file",
    placeholder: "/home/nyrzeff/chromokinesis/colors.json",
    initialValue: "/home/nyrzeff/chromokinesis/colors.json",
    validate(value): any {
        if (value.length === 0) return "Path is mandatory";
    },
}) as string;

const baseColors = await readJsonFile(colorsPath);

const colorOutputFormat = await select({
    message: "Select the color output format",
    options: [
        { value: "hex", label: "Hex" },
        { value: "rgb", label: "RGB" },
        { value: "hsl", label: "HSL" },
    ],
    // required: true,
}) as ColorFormatType;

const hueVariants = await multiselect({
    message: "Select the variants you wish to generate",
    options: [
        { value: "tints", label: "Tints" },
        { value: "tones", label: "Tones" },
        { value: "shades", label: "Shades" },
    ],
    required: true,
}) as string[];

const calculationMethod = await select({
    message: "Pick a calculation method",
    options: [
        {
            value: "mixAmount",
            label: "Calculate according to the amount to mix"
        },
        {
            value: "amountOfColors",
            label: "Calculate according to the total amount of colors"
        },
    ],
}) as string;

let amountOfColors: number, mixAmount: number;

switch (calculationMethod) {
    case "mixAmount": {
        const mixAmount = await text({
            message: "Specify the amount to mix (0-1)",
            placeholder: "Not sure? Use the initial value to test it out",
            initialValue: "0.3",
            validate(value): any {
                if (parseFloat(value) <= 0 || parseFloat(value) >= 1)
                    return "Mix amount has to be greater than 0 and less than 1";
            },
        }) as string;

        const mixAmountF = parseFloat(mixAmount);

        amountOfColors = 1 / mixAmountF;
        generate(amountOfColors, mixAmountF);
        break;
    }
    case "amountOfColors": {
        const amountOfColors = await text({
            message: "Specify the amount of colors you want in your palette",
            placeholder: "...",
            initialValue: "7",
            validate(value): any {
                if (parseInt(value) < 2 || parseInt(value) > 10)
                    return "Amount of colors has to be between 2 and 10";
            },
        }) as string;

        const amountOfColorsI = parseInt(amountOfColors);

        mixAmount = Math.round((1 / amountOfColorsI) * 10) / 10;
        generate(amountOfColorsI, mixAmount);
        break;
    }
}
