import { BinaryReader as Reader } from '../../../build/client/net/binary-reader.js';
import { buildComponents, projectDomain } from '../../../build/client/state/snapshot-projection.js';
import { decodeSnapshotEvents } from '../../../build/client/net/snapshot-decoder.js';
export class DenseGroupDecoder {
    specs;
    constructor(specs) {
        this.specs = specs;
    }
    decode(bytes) {
        try {
            const reader = new Reader(bytes);
            if (reader.u8() !== 1)
                return null;
            const sequence = reader.varint();
            reader.varint();
            const deletes = reader.varint();
            const updates = reader.varint();
            const events = reader.varint();
            const deletedHandles = Array.from({ length: deletes }, () => reader.u32());
            const entities = [];
            for (let index = 0; index < updates; ++index) {
                const handle = reader.u32();
                const flags = reader.u8() ^ 54;
                if ((flags & 8) === 0)
                    return null;
                const denseFields = {};
                for (const spec of this.specs) {
                    if (spec.type === 'byte')
                        denseFields[spec.field] = reader.u8();
                    else if (spec.type === 'f32')
                        denseFields[spec.field] = reader.f32();
                    else if (spec.type === 'f64')
                        denseFields[spec.field] = reader.f64();
                    else if (spec.type === 'varint')
                        denseFields[spec.field] = reader.varint();
                    else if (spec.type === 'string')
                        denseFields[spec.field] = reader.string();
                    else if (spec.type === 'byteArray16')
                        denseFields[spec.field] = Array.from({ length: 16 }, () => reader.u8());
                    else if (spec.type === 'shortArray8')
                        denseFields[spec.field] = Array.from({ length: 8 }, () => reader.varint() & 0xffff);
                    else if (spec.type === 'bit')
                        denseFields[spec.field] = reader.bit();
                    else if (spec.type === 'reference')
                        denseFields[spec.field] = reader.u32();
                    else if (spec.type === 'byteArray10')
                        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u8());
                    else if (spec.type === 'handleArray10')
                        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u32());
                    else if (spec.type === 'stringArray10')
                        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.string());
                    else if (spec.type === 'varintArray10')
                        denseFields[spec.field] = Array.from({ length: 10 }, () => reader.varint());
                    else
                        denseFields[spec.field] = reader.u16();
                }
                const angleRaw = denseFields[8];
                const angle = typeof angleRaw === 'number' ? angleRaw * (2 * Math.PI / 65535) : 0;
                const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
                const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
                const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : cameraX ?? 0;
                const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : cameraY ?? 0;
                const components = buildComponents(denseFields);
                entities.push({ handle, ...projectDomain(components, denseFields), x: positionX, y: positionY,
                    cameraX, cameraY, angle, flags, denseFields, denseByteFields: denseFields,
                    components });
            }
            const decodedEvents = decodeSnapshotEvents(reader, events);
            if (decodedEvents === null || !reader.eof)
                return null;
            return { sequence, serverTime: 0, entities, deletedHandles, events: decodedEvents };
        }
        catch {
            return null;
        }
    }
}
export class DenseByteGroupDecoder extends DenseGroupDecoder {
    constructor(fields) {
        super(fields.map(field => ({ field, type: 'byte' })));
    }
}
export class DenseFloatGroupDecoder extends DenseGroupDecoder {
    constructor(fields) {
        super(fields.map(field => ({ field, type: 'f32' })));
    }
}
export class DenseStringGroupDecoder extends DenseGroupDecoder {
    constructor(fields) {
        super(fields.map(field => ({ field, type: 'string' })));
    }
}
/** Group 52 convenience wrapper (fields 22/54). */
export class DenseGroup52Decoder extends DenseByteGroupDecoder {
    constructor() { super([22, 54]); }
}
/** Dense decoder driven by an explicit present-group set. Groups absent from
 * the set consume no bytes, matching the original target-existence gate. */
export class DensePlanDecoder {
    plans;
    present;
    constructor(plans, present) {
        this.plans = plans;
        this.present = present;
    }
    decode(bytes) {
        try {
            const reader = new Reader(bytes);
            if (reader.u8() !== 1)
                return null;
            const sequence = reader.varint();
            reader.varint();
            const deletes = reader.varint();
            const updates = reader.varint();
            const events = reader.varint();
            const deletedHandles = Array.from({ length: deletes }, () => reader.u32());
            const entities = [];
            for (let index = 0; index < updates; ++index) {
                const handle = reader.u32();
                const flags = reader.u8() ^ 54;
                if ((flags & 8) === 0)
                    return null;
                const denseFields = {};
                for (const plan of this.plans) {
                    if (!this.present.has(plan.offset))
                        continue;
                    const specs = plan.offset === 152 && (flags & 64) === 0
                        ? plan.specs.slice(0, 3) : plan.specs;
                    for (const spec of specs) {
                        if (spec.type === 'byte')
                            denseFields[spec.field] = reader.u8();
                        else if (spec.type === 'f32')
                            denseFields[spec.field] = reader.f32();
                        else if (spec.type === 'f64')
                            denseFields[spec.field] = reader.f64();
                        else if (spec.type === 'varint')
                            denseFields[spec.field] = reader.varint();
                        else if (spec.type === 'reference')
                            denseFields[spec.field] = reader.u32();
                        else if (spec.type === 'angle')
                            denseFields[spec.field] = reader.u16();
                        else if (spec.type === 'string')
                            denseFields[spec.field] = reader.string();
                        else if (spec.type === 'bit')
                            denseFields[spec.field] = reader.bit();
                        else if (spec.type === 'byteArray16')
                            denseFields[spec.field] = Array.from({ length: 16 }, () => reader.u8());
                        else if (spec.type === 'shortArray8')
                            denseFields[spec.field] = Array.from({ length: 8 }, () => reader.varint() & 0xffff);
                        else if (spec.type === 'byteArray10')
                            denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u8());
                        else if (spec.type === 'handleArray10')
                            denseFields[spec.field] = Array.from({ length: 10 }, () => reader.u32());
                        else if (spec.type === 'stringArray10')
                            denseFields[spec.field] = Array.from({ length: 10 }, () => reader.string());
                        else if (spec.type === 'varintArray10')
                            denseFields[spec.field] = Array.from({ length: 10 }, () => reader.varint());
                        else
                            return null;
                    }
                }
                const angleRaw = denseFields[8];
                const angle = typeof angleRaw === 'number' ? angleRaw * (2 * Math.PI / 65535) : 0;
                const cameraX = typeof denseFields[5] === 'number' ? denseFields[5] : undefined;
                const cameraY = typeof denseFields[24] === 'number' ? denseFields[24] : undefined;
                const positionX = typeof denseFields[49] === 'number' ? denseFields[49] : cameraX ?? 0;
                const positionY = typeof denseFields[28] === 'number' ? denseFields[28] : cameraY ?? 0;
                const components = buildComponents(denseFields);
                entities.push({ handle, ...projectDomain(components, denseFields), x: positionX, y: positionY,
                    cameraX, cameraY, angle, flags, denseFields, components });
            }
            const decodedEvents = decodeSnapshotEvents(reader, events);
            if (decodedEvents === null || !reader.eof)
                return null;
            return { sequence, serverTime: 0, entities, deletedHandles, events: decodedEvents };
        }
        catch {
            return null;
        }
    }
}
