var types = require('./types');


var NODES = {
    Root: require('./nodes/Root'),

    Binop: require('./nodes/Binop'),
    EqualityBinop: require('./nodes/EqualityBinop'),
    LogicalBinop: require('./nodes/LogicalBinop'),
    RelativeBinop: require('./nodes/RelativeBinop'),

    Assignment: require('./nodes/Assignment'),
    Break: require('./nodes/Break'),
    CallRaw: require('./nodes/CallRaw'),
    CallStatement: require('./nodes/CallStatement'),
    ConstDeclaration: require('./nodes/ConstDeclaration'),
    Continue: require('./nodes/Continue'),
    Declaration: require('./nodes/Declaration'),
    DoWhile: require('./nodes/DoWhile'),
    Export: require('./nodes/Export'),
    For: require('./nodes/For'),
    Function: require('./nodes/Function'),
    FunctionLambda: require('./nodes/FunctionLambda'),
    If: require('./nodes/If'),
    Import: require('./nodes/Import'),
    Literal: require('./nodes/Literal'),
    Member: require('./nodes/Member'),
    New: require('./nodes/New'),
    ObjectConstructor: require('./nodes/ObjectConstructor'),
    ObjectDeclaration: require('./nodes/ObjectDeclaration'),
    ObjectMember: require('./nodes/ObjectMember'),
    ObjectMethod: require('./nodes/ObjectMethod'),
    ObjectOperatorStatement: require('./nodes/ObjectOperatorStatement'),
    OperatorStatement: require('./nodes/OperatorStatement'),
    Return: require('./nodes/Return'),
    Subscript: require('./nodes/Subscript'),
    SwitchType: require('./nodes/SwitchType'),
    SwitchTypeCase: require('./nodes/SwitchTypeCase'),
    Symbol: require('./nodes/Symbol'),
    TupleLiteral: require('./nodes/TupleLiteral'),
    Type: require('./nodes/Type'),
    TypeCast: require('./nodes/TypeCast'),
    TypeMember: require('./nodes/TypeMember'),
    TypedIdentifier: require('./nodes/TypedIdentifier'),
    Unary: require('./nodes/Unary'),
    While: require('./nodes/While'),

    // Functional nodes
    Block: require('./nodes/Block'),
    CallDecl: require('./nodes/CallDecl'),
    CallRef: require('./nodes/CallRef'),
    FunctionReference: require('./nodes/FunctionReference'),
};

function nodeBase(start, end, base) {
    // Allow non-positional shorthand
    if (start && typeof start !== 'number') {
        base = start;
        start = 0;
        end = 0;
    }

    this.start = start;
    this.end = end;
    this.__base = base;
    for (var prop in base) {
        this[prop] = base[prop];
    }
}

function buildNode(proto, name) {
    // We do this so that in stack traces, the method names look like:
    //   FunctionReference.getType()
    // instead of:
    //   node.getType()
    var node = eval(
        '(function ' + name + '(start, end, base){(' +
        nodeBase.toString() + '.apply(this, arguments))})'
    );

    for (var protoMem in proto) {
        node.prototype[protoMem] = proto[protoMem];
    }
    node.prototype.type = name;
    node.prototype.clone = function clone() {
        var out = new node(
            this.start,
            this.end,
            {}
        );

        for (var item in this) {
            if (!this.hasOwnProperty(item)) continue;

            if (this[item] && this[item].clone) {
                out[item] = this[item].clone();
                continue;
            }

            if (this[item] instanceof Array) {
                out[item] = this[item].map(function(x) {
                    if (x && x.clone) {
                        return x.clone();
                    }

                    return x;
                });
                continue;
            }

            out[item] = this[item];
        }

        return out;
    };
    return node;
}

module.exports = {};
for (var node in NODES) {
    module.exports[node] = buildNode(NODES[node], node);
}
