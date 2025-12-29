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

type ColorFormat = "hex" | "rgb" | "hsl";
type HueVariants = ["tints" | "shades" | "tones"];

interface Variants {
    hue: string;
    tints?: string[];
    shades?: string[];
    tones?: string[];
}

async function readJsonFile(path: string): Promise<any> {
    try {
        const data = await readFile(path, { encoding: "utf-8" });
        return JSON.parse(data);
    } catch (err: any) {
        console.error(`Error reading file: ${err.message}`);
    }
}

function format(colorOutputFormat: ColorFormat): any {
    if (colorOutputFormat === "hex")
        return formatHex;
    else if (colorOutputFormat === "rgb")
        return formatRgb;
    else if (colorOutputFormat === "hsl")
        return formatHsl;
}

async function generateVariants(
    hex: string,
    hueVariants: HueVariants,
    amountOfColors: number,
    mixAmount: number,
    colorOutputFormat: ColorFormat,
): Promise<Variants> {
    const oklch = converter("oklch");

    const hue: any = oklch(hex);
    const formattedHue = format(colorOutputFormat)(hue);

    const result: Variants = {
        hue: "",
    };

    if (typeof formattedHue === "string")
        result.hue = formattedHue;

    const blend = (base: string, mix: number, mixAmount: number) =>
        interpolate([base, mix])(mixAmount);

    // add proper type
    const mixColors = new Map<string, any>();

    mixColors.set("tints", parse("oklch(1 0 0)"));
    mixColors.set("shades", parse("oklch(0 0 0)"));
    mixColors.set("tones", parse("oklch(0.5 0 0)"));

    for (let i = 1; i <= amountOfColors; i++) {
        for (const variant of hueVariants) {
            if (mixAmount * i >= 1) continue;

            const mixed =
                blend(hue, mixColors.get(variant), mixAmount * i);
            const formatted = format(colorOutputFormat)(mixed);

            if (formatted === result.hue) continue;
            if (typeof result[variant] === "undefined") result[variant] = [];
            if (result[variant]?.includes(formatted)) continue;

            result[variant]?.push(formatted);
        }
    }
    return result;
};

async function generate(
    amountOfColors: number,
    mixAmount: number
): Promise<void> {
    const allColors = Object.assign(baseColors);

    for (const [key, hex] of Object.entries(baseColors)) {
        console.log(`Generating variants for ${key}`);

        const variants = await generateVariants(
            hex as string,
            hueVariants,
            amountOfColors,
            mixAmount,
            colorOutputFormat
        );

        allColors[key] = variants;
    }

    const replacer = (_: unknown, value: string) => {
        return value === "" ? undefined : value;
    };

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
}) as ColorFormat;

const hueVariants = await multiselect({
    message: "Select the variants you wish to generate",
    options: [
        { value: "tints", label: "Tints" },
        { value: "tones", label: "Tones" },
        { value: "shades", label: "Shades" },
    ],
    required: true,
}) as HueVariants;

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
                const valueF = parseFloat(value);

                if (valueF <= 0 || valueF >= 1)
                    return "Mix amount has to be greater than 0 and less than 1";
                if (Math.floor(1 / valueF) > 100)
                    return "Please choose a larger value, as with this value the amount of colors to generate would be too large";
            },
        }) as string;

        const mixAmountF = parseFloat(mixAmount);

        amountOfColors = Math.floor(1 / mixAmountF);
        generate(amountOfColors, mixAmountF);
        break;
    }
    case "amountOfColors": {
        const amountOfColors = await text({
            message: "Specify the total amount of colors you want",
            placeholder: "...",
            initialValue: "5",
            validate(value): any {
                const valueI = parseInt(value);

                if (valueI < 2 || valueI > 100)
                    return "Amount of colors has to be between 2 and 100";
            },
        }) as string;

        const amountOfColorsI = parseInt(amountOfColors);

        mixAmount = 1 / amountOfColorsI;
        generate(amountOfColorsI, mixAmount);
        break;
    }
}
