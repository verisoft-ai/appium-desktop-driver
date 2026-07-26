import { describe, it, expect } from 'vitest';
import { buildSomPrompt, parseSomTagResponse } from '../../lib/vision/som-prompt';

describe('buildSomPrompt', () => {
    it('includes the prompt and mark count', () => {
        const prompt = buildSomPrompt('the Save button', 12);
        expect(prompt).toContain('the Save button');
        expect(prompt).toContain('1 to 12');
        expect(prompt).toContain('"tag"');
    });
});

describe('parseSomTagResponse', () => {
    it('parses a valid tag response', () => {
        const result = parseSomTagResponse('{"tag": 3, "label": "Save button"}', 'save button', 10);
        expect(result).toEqual({ tag: 3, label: 'Save button' });
    });

    it('extracts JSON from surrounding text', () => {
        const result = parseSomTagResponse('Sure! {"tag": 5, "label": "OK"} there you go', 'OK', 10);
        expect(result.tag).toBe(5);
    });

    it('throws on malformed JSON', () => {
        expect(() => parseSomTagResponse('no json here', 'x', 10)).toThrow('Unexpected LLM response');
    });

    it('throws when tag is not an integer', () => {
        expect(() => parseSomTagResponse('{"tag": "three", "label": "x"}', 'x', 10)).toThrow('Unexpected LLM response');
    });

    it('throws Element not found on tag -1', () => {
        expect(() => parseSomTagResponse('{"tag": -1, "label": "not found"}', 'a purple elephant', 10))
            .toThrow('Element not found: "a purple elephant"');
    });

    it('throws when tag is above markCount', () => {
        expect(() => parseSomTagResponse('{"tag": 11, "label": "x"}', 'x', 10))
            .toThrow('LLM returned tag 11 but only 10 marks exist');
    });

    it('throws when tag is 0 or below (excluding -1)', () => {
        expect(() => parseSomTagResponse('{"tag": 0, "label": "x"}', 'x', 10))
            .toThrow('LLM returned tag 0 but only 10 marks exist');
    });
});
