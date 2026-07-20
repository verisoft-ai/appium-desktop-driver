/** Builds the Set-of-Mark VLM prompt: pick a tag number rather than regress raw pixel coordinates. */
export function buildSomPrompt(userPrompt: string, markCount: number): string {
    return (
        `This screenshot has been annotated with numbered tags (small numbered circles) placed on candidate UI elements, numbered 1 to ${markCount}.\n` +
        `Locate the following element: "${userPrompt}"\n` +
        `Respond ONLY with a JSON object, no other text:\n` +
        `{"tag": <integer 1-${markCount}, or -1 if no tag matches>, "label": "<brief description of what tag you chose>"}`
    );
}

export interface SomTagResponse {
    tag: number;
    label: string;
}

/** Parses a Set-of-Mark tag-selection response. Throws on malformed JSON, not-found, or an out-of-range tag. */
export function parseSomTagResponse(raw: string, prompt: string, markCount: number): SomTagResponse {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error(`Unexpected LLM response: ${raw}`);
    }
    const parsed = JSON.parse(jsonMatch[0]) as { tag: number; label: string };
    if (!Number.isInteger(parsed.tag)) {
        throw new Error(`Unexpected LLM response: ${raw}`);
    }
    if (parsed.tag === -1) {
        throw new Error(`Element not found: "${prompt}"`);
    }
    if (parsed.tag < 1 || parsed.tag > markCount) {
        throw new Error(`LLM returned tag ${parsed.tag} but only ${markCount} marks exist`);
    }
    return { tag: parsed.tag, label: parsed.label };
}
