import { AppiumDesktopDriver } from '../driver';
import { getResolutionScalingFactor } from '../winapi/user32';
import {
    CoordMapping,
    computeCoordMapping,
    formatVisionError,
    getApiKeyEnvVar,
    getProviderForModel,
    locateElementByVision,
    VisionStep,
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
    args: { prompt: string; model: string; includeAnnotatedImage?: boolean },
): Promise<{ x: number; y: number; label: string; steps: VisionStep[]; annotatedImageBase64?: string }> {
    if (!args.prompt) {
        throw new Error('windows: findByVision requires a "prompt" argument.');
    }
    if (!args.model) {
        throw new Error(
            'windows: findByVision requires a "model" argument. ' +
            'Supported prefixes: claude-* (ANTHROPIC_API_KEY), gpt-*/o-series (OPENAI_API_KEY), ' +
            'gemini-* (GEMINI_API_KEY), amazon.nova-*/us.amazon.nova-*/eu.amazon.nova-*/ap.amazon.nova-* (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY).'
        );
    }
    const model = args.model;
    const provider = getProviderForModel(model);
    const envVar = getApiKeyEnvVar(provider);
    const apiKey = process.env[envVar];
    if (!apiKey) {
        throw new Error(
            `${envVar} environment variable is required for windows: findByVision (model: ${model})`
        );
    }
    if (provider === 'amazon' && !process.env.AWS_SECRET_ACCESS_KEY) {
        throw new Error('AWS_SECRET_ACCESS_KEY environment variable is required for Amazon Bedrock models');
    }

    const base64 = await this.getScreenshot();

    try {
        const result = await locateElementByVision({
            prompt: args.prompt,
            model,
            apiKey,
            screenshotBase64: base64,
            buildMapping: (ssW, ssH) => buildCoordMapping(this, ssW, ssH),
            includeAnnotatedImage: args.includeAnnotatedImage,
        });
        this.log?.info(`[findByVision] steps:\n${result.steps.map((s) => `  [${s.status}] ${s.name}: ${s.detail}`).join('\n')}`);
        return result;
    } catch (err) {
        throw new Error(formatVisionError(err));
    }
}
