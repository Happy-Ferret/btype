import * as symbols from '../symbols';


export default class BaseNode {
    constructor(start, end) {
        this.start = start;
        this.end = end;
    }

    get TypeError() {
        return error => new TypeError(error + ' (' + this.start + ':' + this.end + ')');
    }

    traverse() {
        throw new Error('Not implemented');
    }

    toString() {
        return 'Unknown Node';
    }

    _indent(input, level) {
        level = level || 1;
        var indentation = '';
        while (level) {
            indentation += '    ';
            level--;
        }
        return input.split('\n').map(function(line) {
            return indentation + line;
        }).join('\n');
    }

    clone() {
        var clone = new this.constructor();
        Object.keys(this).forEach(k => {
            clone[k] = this[k];
        });
        return clone;
    }

    setFlag(flag) {
        this[symbols[flag]] = true;
    }

    hasFlag(flag) {
        return !!this[symbols[flag]];
    }

    pack(bitstr) {
        bitstr.writebits(this.id, 8);
        bitstr.writebits(this.start, 32);
        bitstr.writebits(this.end, 32);
    }
    packStr(bitstr, str) {
        bitstr.writebits(str.length, 32);
        for (var i = 0 ; i < str.length; i++) {
            bitstr.writebits(str.charCodeAt(i), 16);
        }
    }


    iterate(cb, afterCB) {
        this.traverse((node, memeber) => {
            if (!node) return;
            var ret = cb(node, member);
            if (ret === false) return;
            node.iterate(callback, afterCB);
            if (afterCB) afterCB(node, member);
        });
    }

    iterateWithSelf(cb, afterCB) {
        cb(this, null);
        this.iterate(cb, afterCB);
        if (afterCB) afterCB(this, null);
    }

};
