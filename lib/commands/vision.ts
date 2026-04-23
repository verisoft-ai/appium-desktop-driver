import { AppiumDesktopDriver } from '../driver';
import { getPngDimensions } from '../util';
import { getResolutionScalingFactor } from '../winapi/user32';
import {
    CoordMapping,
    applyCoordMapping,
    buildVisionPrompt,
    callVisionLLM,
    computeCoordMapping,
    getApiKeyEnvVar,
    getProviderForModel,
    parseVisionCoords,
} from '../vision-utils';

async function buildCoordMapping(
    driver: AppiumDesktopDriver,
    ssW: number,
    ssH: number,
): Promise<CoordMapping> {
    const rect = await driver.getWindowRect();
    const isRoot = rect.width > 10000;

    if (isRoot) {
        const monitors = await driver.windowsGetMonitors() as Array<{
            primary: boolean;
            bounds: { width: number; height: number };
        }>;
        const primary = monitors.find((m) => m.primary) ?? monitors[0];
        return computeCoordMapping(
            true,
            rect.x, rect.y, rect.width, rect.height,
            1, ssW, ssH,
            primary?.bounds?.width, primary?.bounds?.height,
        );
    }

    return computeCoordMapping(
        false,
        rect.x, rect.y, rect.width, rect.height,
        getResolutionScalingFactor(),
        ssW, ssH,
    );
}

export async function executeFindByVision(
    this: AppiumDesktopDriver,
    args: { prompt: string; model: string },
): Promise<{ x: number; y: number; label: string }> {
    if (!args.model) {
        throw new Error(
            'windows: findByVision requires a "model" argument. ' +
            'Supported prefixes: claude-* (ANTHROPIC_API_KEY), gpt-*/o-series (OPENAI_API_KEY), ' +
            'gemini-* (GEMINI_API_KEY), amazon.nova-* (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY).'
        );
    }
    const model = args.model;
    const envVar = getApiKeyEnvVar(getProviderForModel(model));
    const apiKey = process.env[envVar];
    if (!apiKey) {
        throw new Error(
            `${envVar} environment variable is required for windows: findByVision (model: ${model})`
        );
    }

    const base64 = await this.getScreenshot();
    const { width: ssW, height: ssH } = getPngDimensions(base64);

    const raw = await callVisionLLM(base64, buildVisionPrompt(args.prompt, ssW, ssH), model, apiKey);
    const parsed = parseVisionCoords(raw, args.prompt);

    const mapping = await buildCoordMapping(this, ssW, ssH);
    return {
        ...applyCoordMapping(mapping, parsed.x, parsed.y),
        label: parsed.label,
    };
}
