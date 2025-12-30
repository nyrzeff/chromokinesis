import fs from "fs";
import os from "os";
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
    tints?: Record<string, string>[];
    shades?: Record<string, string>[];
    tones?: Record<string, string>[];
}

function areColorsValid(colors: string[]): boolean {
    for (let color of colors)
        if (typeof parse(color) === "undefined") return false;
    return true;
}

async function getBaseColors(path: string): Promise<object | null> {
    try {
        const data = await readFile(path, { encoding: "utf-8" });
        const parsed = JSON.parse(data);

        if (!areColorsValid(Object.values(parsed))) return null;
        return parsed;
    } catch (err: any) {
        console.error(`Error reading file: ${err.message}`);
    }
    return null;
}

function format(colorOutputFormat: ColorFormat): any {
    if (colorOutputFormat === "hex")
        return formatHex;
    else if (colorOutputFormat === "rgb")
        return formatRgb;
    else if (colorOutputFormat === "hsl")
        return formatHsl;
}

async function computeVariants(
    colorName: string,
    colorCode: string,
    hueVariants: HueVariants,
    amountOfColors: number,
    mixAmount: number,
    colorOutputFormat: ColorFormat,
): Promise<Variants> {
    const oklch = converter("oklch");

    const hue: any = oklch(colorCode);
    const formattedHue = format(colorOutputFormat)(hue);

    const result: Variants = {
        hue: "",
        tints: [],
        shades: [],
        tones: [],
    };

    if (typeof formattedHue === "string")
        result.hue = formattedHue;

    const blend = (base: string, mix: string, mixAmount: number) =>
        interpolate([base, mix])(mixAmount);

    const mixColors = {
        tints: "#ffffff",
        shades: "#000000",
        tones: "#636363"
    };

    for (let i = 1; i <= amountOfColors; i++) {
        for (const variant of hueVariants) {
            const roundedMixAmount = +((mixAmount * i).toFixed(2));

            if (roundedMixAmount >= 1) continue;

            const mixed =
                blend(hue, mixColors[variant], roundedMixAmount);
            const formatted = format(colorOutputFormat)(mixed);

            if (Object.values(mixColors).includes(formatted) ||
                formatted === result.hue ||
                result["shades"]!.map((variant: Record<string, string>) =>
                    Object.values(variant)[0]).includes(formatted)
            )
                continue;

            const title =
                `${colorName}-${variant.slice(0, -1)}-${+(roundedMixAmount * 100).toFixed(2)}`;

            const color = { [title]: formatted };

            result[variant]?.push(color);
        }
    }
    return result;
};

async function generatePalette(
    amountOfColors: number,
    mixAmount: number
): Promise<void> {
    if (!baseColors) return;
    const palette = Object.assign(baseColors);

    for (const [colorName, colorCode] of Object.entries(baseColors)) {
        console.log(`Generating variants for ${colorName}`);

        const variants = await computeVariants(
            colorName,
            colorCode as string,
            hueVariants,
            amountOfColors,
            mixAmount,
            colorOutputFormat
        );

        palette[colorName] = variants;
    }

    const replacer = (_: string, value: object[]) => {
        return value.length === 0 ? undefined : value;
    };

    // TODO: replace hardcoded path
    fs.writeFileSync(
        `/home/${username}/chromokinesis/custom-palette.json`,
        JSON.stringify(palette, replacer, 2));

    outro("Your color variants are available in custom-palette.json");
}

intro("chromokinesis");

const username = os.userInfo().username;

const colorFilePath = await text({
    message: "Specify the path to the file containing the base colors",
    placeholder: `/home/${username}/chromokinesis/colors.json`,
    initialValue: `/home/${username}/chromokinesis/colors.json`,
    validate(value): any {
        const extension = value.substring(value.lastIndexOf(".") + 1);

        if (value.length === 0) return "Path is mandatory";
        if (extension !== "json") return "Chromokinesis only supports .json files at the moment";
    },
}) as string;

const baseColors = await getBaseColors(colorFilePath);

if (!baseColors) {
    outro("Exiting program because an error occurred while reading the file");
    process.exit();
}

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
}) as "mixAmount" | "amountOfColors";

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
        generatePalette(amountOfColors, mixAmountF);
        break;
    }
    case "amountOfColors": {
        const amountOfColors = await text({
            message: "Specify the amount of variants to generate (1-100)",
            placeholder: "...",
            initialValue: "5",
            validate(value): any {
                const valueI = parseInt(value);

                if (valueI < 1 || valueI > 100)
                    return "Amount of variants has to be between 1 and 100";
            },
        }) as string;

        const amountOfColorsI = parseInt(amountOfColors);

        mixAmount = 1 / (amountOfColorsI + 1);
        generatePalette(amountOfColorsI, mixAmount);
        break;
    }
}
