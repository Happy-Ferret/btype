var makeName = exports.makeName = function makeName(assignedName) {
    assignedName = assignedName.replace(/_/g, '.');
    return assignedName.replace(/\$/g, '_');
};

var getLLVMType = exports.getLLVMType = function getLLVMType(type) {
    if (type._type === 'primitive') {
        switch (type.typeName) {
            case 'bool': return 'i8'; // TODO: would this be better as i1?
            case 'int': return 'i32';
            case 'float': return 'double';
            case 'sfloat': return 'float';

            case 'byte': return 'i8';
            case 'uint': return 'i32'; // uint is distinguished by the operators used
        }

        throw new TypeError('Unknown type name "' + type.typeName + '"');
    }

    if (type._type === 'func') {
        return '%' + makeName(type.flatTypeName());
    }

    return '%' + makeName(type.flatTypeName()) + '*';
};

exports.getAlignment = function getAlignment(type) {
    if (type._type === 'primitive') {
        return type.getSize();
    }
    if (type._type === 'func') {
        return 8;
    }
    return 4;
};

exports.getFunctionSignature = function getFunctionSignature(type) {
    var out = type.returnType ? getLLVMType(type.returnType) : 'void';
    out += ' (';
    if (type.args.length) {
        out += type.args.map(getLLVMType).join(', ');
    } else {
        out += '...';
    }
    out += ')*';
    return out;
};
