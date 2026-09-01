/**
 * Unit tests for the XPath engine (lib/xpath/core.ts).
 *
 * The engine never touches a real UIA tree — it emits scope + ConditionDto queries
 * through a `sendCommand` callback. These tests drive it against an in-memory tree
 * with a fake `sendCommand`, so axis resolution, predicates and functions get spec
 * coverage without a running app.
 */
import { describe, it, expect } from 'vitest';
import { W3C_ELEMENT_KEY } from 'appium/driver';
import { xpathToElIdOrIds, type SendCommandFn } from '../../lib/xpath/core';

// ── Fake tree ───────────────────────────────────────────────────────────────

interface FakeNode {
    id: string;
    controlType: string;
    props: Record<string, string>;
    children: FakeNode[];
    parent?: FakeNode;
    order: number;
}

interface Spec {
    ct: string;
    props?: Record<string, string>;
    children?: Spec[];
}

function buildTree(rootSpec: Spec): { root: FakeNode; byId: Map<string, FakeNode>; order: FakeNode[] } {
    const byId = new Map<string, FakeNode>();
    const order: FakeNode[] = [];
    let seq = 0;

    const build = (spec: Spec, parent?: FakeNode): FakeNode => {
        const node: FakeNode = {
            id: `n${seq}`,
            controlType: spec.ct,
            props: { Name: '', AutomationId: '', ClassName: '', HelpText: '', ...spec.props },
            children: [],
            parent,
            order: seq,
        };
        seq += 1;
        byId.set(node.id, node);
        order.push(node);
        node.children = (spec.children ?? []).map((c) => build(c, node));
        return node;
    };

    const root = build(rootSpec);
    return { root, byId, order };
}

function descendants(node: FakeNode): FakeNode[] {
    return node.children.flatMap((c) => [c, ...descendants(c)]);
}

function ancestors(node: FakeNode): FakeNode[] {
    const out: FakeNode[] = [];
    let cur = node.parent;
    while (cur) { out.push(cur); cur = cur.parent; }
    return out;
}

function siblings(node: FakeNode): FakeNode[] {
    return node.parent ? node.parent.children : [];
}

function matchesDto(node: FakeNode, dto: any): boolean {
    switch (dto.type) {
        case 'true': return true;
        case 'false': return false;
        case 'and': return dto.conditions.every((c: any) => matchesDto(node, c));
        case 'or': return dto.conditions.some((c: any) => matchesDto(node, c));
        case 'not': return !matchesDto(node, dto.condition);
        case 'property': {
            if (dto.property === 'ControlType') { return node.controlType === String(dto.value); }
            const actual = node.props[dto.property] ?? '';
            const expected = Array.isArray(dto.value) ? dto.value.join('.') : String(dto.value);
            if (dto.match === 'contains') { return actual.includes(expected); }
            if (dto.match === 'startsWith') { return actual.startsWith(expected); }
            return actual === expected;
        }
        default: return false;
    }
}

function scopeNodes(scope: string, ctx: FakeNode, all: FakeNode[]): FakeNode[] {
    switch (scope) {
        case 'element': return [ctx];
        case 'children': return ctx.children;
        case 'descendants': return descendants(ctx);
        case 'subtree': return [ctx, ...descendants(ctx)];
        case 'parent': return ctx.parent ? [ctx.parent] : [];
        case 'ancestors': return ancestors(ctx);
        case 'ancestors-or-self': return [ctx, ...ancestors(ctx)];
        case 'following-sibling': return siblings(ctx).filter((s) => s.order > ctx.order);
        case 'preceding-sibling': return siblings(ctx).filter((s) => s.order < ctx.order);
        case 'following': {
            const anc = new Set([ctx, ...ancestors(ctx), ...descendants(ctx)]);
            return all.filter((n) => n.order > ctx.order && !anc.has(n));
        }
        case 'preceding': {
            const anc = new Set([ctx, ...ancestors(ctx), ...descendants(ctx)]);
            return all.filter((n) => n.order < ctx.order && !anc.has(n));
        }
        default: throw new Error(`fake: unhandled scope ${scope}`);
    }
}

function makeSendCommand(tree: ReturnType<typeof buildTree>): SendCommandFn {
    const { root, byId, order } = tree;
    return async (method, params) => {
        switch (method) {
            case 'saveRootElementToTable':
                return root.id;
            case 'getProperty': {
                const node = byId.get(params.elementId as string);
                const prop = params.property as string;
                if (!node) { return ''; }
                if (prop === 'ControlType') { return node.controlType; }
                return node.props[prop] ?? '';
            }
            case 'getTagName':
                return byId.get(params.elementId as string)?.controlType ?? '';
            case 'getRect':
                return { x: 0, y: 0, width: 0, height: 0 };
            case 'findElement':
            case 'findElements': {
                const ctx = params.contextElementId ? byId.get(params.contextElementId as string)! : root;
                const candidates = scopeNodes(params.scope as string, ctx, order);
                const hits = candidates
                    .filter((n) => matchesDto(n, params.condition))
                    .sort((a, b) => a.order - b.order)
                    .map((n) => n.id);
                return method === 'findElement' ? (hits[0] ?? null) : hits;
            }
            default:
                throw new Error(`fake: unhandled method ${method}`);
        }
    };
}

// ── Shared fixture ──────────────────────────────────────────────────────────

const tree = buildTree({
    ct: 'Window', props: { Name: 'Calculator' }, children: [
        {
            ct: 'Group', props: { AutomationId: 'NumberPad' }, children: [
                { ct: 'Button', props: { Name: 'One', AutomationId: 'num1Button' } },
                { ct: 'Button', props: { Name: 'Two', AutomationId: 'num2Button' } },
                { ct: 'Button', props: { Name: 'Three', AutomationId: 'num3Button' } },
                { ct: 'Edit', props: { AutomationId: 'display' } },
            ],
        },
        {
            ct: 'Group', props: { AutomationId: 'OpPad' }, children: [
                { ct: 'Button', props: { Name: 'Plus', AutomationId: 'plusButton' } },
                { ct: 'Button', props: { Name: 'Minus', AutomationId: 'minusButton' } },
            ],
        },
        { ct: 'Text', props: { Name: 'Result' } },
    ],
});
const send = makeSendCommand(tree);
const nameOf = (id: string) => tree.byId.get(id)?.props.Name ?? tree.byId.get(id)?.props.AutomationId ?? id;

async function findAll(xpath: string): Promise<string[]> {
    const els = await xpathToElIdOrIds(xpath, true, undefined, send) as Array<Record<string, string>>;
    return els.map((e) => e[W3C_ELEMENT_KEY]);
}
async function findOne(xpath: string): Promise<string> {
    const el = await xpathToElIdOrIds(xpath, false, undefined, send) as Record<string, string>;
    return el[W3C_ELEMENT_KEY];
}

// ── Axes ────────────────────────────────────────────────────────────────────

describe('axes', () => {
    it('descendant: //Button', async () => {
        expect((await findAll('//Button')).map(nameOf))
            .toEqual(['One', 'Two', 'Three', 'Plus', 'Minus']);
    });

    it('child: /Window/Group', async () => {
        expect(await findAll('/Window/Group')).toHaveLength(2);
    });

    it('following-sibling by attribute', async () => {
        const id = await findOne('//Button[@AutomationId="num1Button"]/following-sibling::Button');
        expect(nameOf(id)).toBe('Two');
    });

    it('following-sibling returns all later siblings', async () => {
        expect((await findAll('//Button[@AutomationId="num1Button"]/following-sibling::Button')).map(nameOf))
            .toEqual(['Two', 'Three']);
    });

    it('preceding-sibling is the reciprocal', async () => {
        const id = await findOne('//Button[@AutomationId="num3Button"]/preceding-sibling::Button[@AutomationId="num1Button"]');
        expect(nameOf(id)).toBe('One');
    });

    it('following-sibling picks up a different node type when present', async () => {
        // the Edit "display" is a later sibling of num1Button inside NumberPad
        expect(await findAll('//Button[@AutomationId="num1Button"]/following-sibling::Edit'))
            .toHaveLength(1);
    });

    it('following-sibling is empty when nothing follows', async () => {
        expect(await findAll('//Text[@Name="Result"]/following-sibling::Button')).toHaveLength(0);
    });

    it('parent axis', async () => {
        const id = await findOne('//Button[@AutomationId="num1Button"]/parent::Group');
        expect(tree.byId.get(id)?.props.AutomationId).toBe('NumberPad');
    });

    it('abbreviated ..', async () => {
        const id = await findOne('//Button[@AutomationId="num1Button"]/..');
        expect(tree.byId.get(id)?.props.AutomationId).toBe('NumberPad');
    });

    it('ancestor axis', async () => {
        expect(await findAll('//Button[@AutomationId="num1Button"]/ancestor::Window')).toHaveLength(1);
    });

    it('ancestor-or-self matches self', async () => {
        const id = await findOne('//Button[@AutomationId="num1Button"]/ancestor-or-self::Button');
        expect(nameOf(id)).toBe('One');
    });

    it('self::Button matches, self::Edit does not', async () => {
        expect(await findAll('//Button[@AutomationId="num1Button"]/self::Button')).toHaveLength(1);
        expect(await findAll('//Button[@AutomationId="num1Button"]/self::Edit')).toHaveLength(0);
    });

    it('following / preceding in document order', async () => {
        expect((await findAll('//Button[@AutomationId="num1Button"]/following::Button')).map(nameOf))
            .toEqual(['Two', 'Three', 'Plus', 'Minus']);
        expect((await findAll('//Button[@AutomationId="minusButton"]/preceding::Button')).map(nameOf))
            .toEqual(['One', 'Two', 'Three', 'Plus']);
    });
});

// ── Predicates & functions ──────────────────────────────────────────────────

describe('predicates and functions', () => {
    it('contains() on @Name', async () => {
        expect((await findAll('//Button[contains(@Name,"in")]')).map(nameOf))
            .toEqual(['Minus']);
    });

    it('starts-with() on @Name', async () => {
        expect((await findAll('//Button[starts-with(@Name,"T")]')).map(nameOf))
            .toEqual(['Two', 'Three']);
    });

    it('and / or predicates', async () => {
        expect((await findAll('//Button[@Name="One" and @AutomationId="num1Button"]')).map(nameOf))
            .toEqual(['One']);
        expect((await findAll('//Button[@Name="One" or @Name="Two"]')).map(nameOf))
            .toEqual(['One', 'Two']);
    });

    it('not() predicate', async () => {
        expect((await findAll('//Group[@AutomationId="NumberPad"]/Button[not(@AutomationId="num1Button")]')).map(nameOf))
            .toEqual(['Two', 'Three']);
    });

    it('positional step predicate [N] and [last()]', async () => {
        expect(nameOf(await findOne('//Group[@AutomationId="NumberPad"]/Button[1]'))).toBe('One');
        expect(nameOf(await findOne('//Group[@AutomationId="NumberPad"]/Button[last()]'))).toBe('Three');
    });

    it('count() inside a predicate', async () => {
        const ids = await findAll('//Group[count(child::Button) >= 3]');
        expect(ids.map((id) => tree.byId.get(id)?.props.AutomationId)).toEqual(['NumberPad']);
    });

    it('union operator', async () => {
        expect((await findAll('//Button[@AutomationId="num1Button"] | //Button[@AutomationId="plusButton"]')).map(nameOf))
            .toEqual(['One', 'Plus']);
    });
});

// ── Filter expressions: (node-set)[ predicate ] ─────────────────────────────

describe('filter expressions', () => {
    it('(set)[last()] selects the final node', async () => {
        expect(nameOf(await findOne('(//Group[@AutomationId="NumberPad"]/Button)[last()]'))).toBe('Three');
    });

    it('(set)[1] selects the first node', async () => {
        expect(nameOf(await findOne('(//Button)[1]'))).toBe('One');
    });

    it('(set)[position() > 3] slices the set', async () => {
        expect((await findAll('(//Button)[position() > 3]')).map(nameOf)).toEqual(['Plus', 'Minus']);
    });

    it('(set)[position() = last()] equals [last()]', async () => {
        expect(nameOf(await findOne('(//Button)[position() = last()]'))).toBe('Minus');
    });

    it('(set)[last() - 1] arithmetic on position', async () => {
        expect(nameOf(await findOne('(//Button)[last() - 1]'))).toBe('Plus');
    });

    it('non-positional predicate on a filter expression', async () => {
        expect((await findAll('(//Button)[contains(@Name,"in")]')).map(nameOf)).toEqual(['Minus']);
    });
});

// ── Errors ──────────────────────────────────────────────────────────────────

describe('errors', () => {
    it('throws NoSuchElement for a non-matching single find', async () => {
        await expect(xpathToElIdOrIds('//Button[@Name="ZZZ"]', false, undefined, send))
            .rejects.toThrow();
    });

    it('returns [] for a non-matching multi find', async () => {
        expect(await findAll('//Button[@Name="ZZZ"]')).toEqual([]);
    });

    it('throws InvalidSelector for malformed XPath', async () => {
        await expect(xpathToElIdOrIds('//[[[', true, undefined, send)).rejects.toThrow();
    });
});
