var type = require('./types');


function binop_traverser(cb) {
    cb(this.left, 'left');
    cb(this.right, 'right');
}
function binop_substitution(cb) {
    this.left = cb(this.left, 'left') || this.left;
    this.right = cb(this.right, 'right') || this.right;
}
function loop_traverser(cb) {
    cb(this.condition, 'condition');
    this.loop.forEach(cb);
}
function loop_substitution(cb) {
    this.condition = cb(this.condition, 'condition') || this.condition;
    this.loop = this.loop.map(function(stmt) {
        return cb(stmt, 'body');
    }).filter(ident);
}
function boolType() {
    return new type('bool');
}
function loopValidator(ctx) {
    this.condition.validateTypes(ctx);
    this.loop.forEach(function(stmt) {stmt.validateTypes(ctx);});
}

function ident(arg) {return arg;}

var NODES = {
    Root: {
        traverse: function(cb) {
            this.body.forEach(cb);
        },
        substitute: function(cb) {
            this.body = this.body.map(function(stmt) {
                return cb(stmt, 'body');
            }).filter(ident);
        },
        validateTypes: function(ctx) {
            this.body.forEach(function(stmt) {
                stmt.validateTypes(ctx);
            });
        }
    },
    Unary: {
        traverse: function(cb) {
            cb(this.base);
        },
        substitute: function(cb) {
            this.base = cb(this.base, 'base') || this.base;
        },
        getType: function(ctx) {
            return this.operator === '-' ? this.base.getType(ctx) : new type('bool');
        },
        validateTypes: function(ctx) {
            this.base.validateTypes(ctx);
            if (this.operator === '-') {
                var baseType = this.base.getType(ctx);
                if (baseType.name !== 'int' && baseType.name !== 'float') {
                    throw new TypeError('Invalid type for unary minus');
                }
            }
        }
    },
    LogicalBinop: {
        traverse: binop_traverser,
        substitute: binop_substitution,
        getType: boolType,
        validateTypes: function(ctx) {
            this.left.validateTypes(ctx);
            this.right.validateTypes(ctx);
        }
    },
    EqualityBinop: {
        traverse: binop_traverser,
        substitute: binop_substitution,
        getType: boolType,
        validateTypes: function(ctx) {
            this.left.validateTypes(ctx);
            this.right.validateTypes(ctx);
            if (!this.left.getType(ctx).equals(this.right.getType(ctx))) {
                throw new TypeError('Equality operations may only be performed against same types');
            }
        }
    },
    RelativeBinop: {
        traverse: binop_traverser,
        substitute: binop_substitution,
        getType: boolType,
        validateTypes: function(ctx) {
            this.left.validateTypes(ctx);
            this.right.validateTypes(ctx);
            if (!this.left.getType(ctx).equals(this.right.getType(ctx))) {
                throw new TypeError('Comparison operations may only be performed against same types');
            }
        }
    },
    Binop: {
        traverse: binop_traverser,
        substitute: binop_substitution,
        getType: function(ctx) {
            // TODO: implement basic casting
            return this.left.getType(ctx);
        },
        validateTypes: function(ctx) {
            this.left.validateTypes(ctx);
            this.right.validateTypes(ctx);
            var left = this.left.getType(ctx);
            var right = this.right.getType(ctx);
            if (!left.equals(right)) {
                // TODO: implement basic casting
                throw new TypeError('Mismatched types in binop');
            }
        }
    },
    Call: {
        traverse: function(cb) {
            cb(this.callee, 'callee');
            this.params.forEach(cb);
        },
        substitute: function(cb) {
            this.callee = cb(this.callee, 'callee') || this.callee;
            this.params = this.params.map(function(stmt) {
                return cb(stmt, 'params');
            }).filter(ident);
        },
        getType: function(ctx) {
            return this.callee.getType(ctx).traits[0];
        },
        validateTypes: function(ctx) {
            this.callee.validateTypes(ctx);
            this.params.forEach(function(p) {p.validateTypes(ctx);});

            var base = this.callee.getType(ctx);
            if (base.name !== 'func') {
                throw new Error('Call to non-executable type');
            }

            var paramTypes = base.slice(1);
            if (this.params.length < paramTypes.length) {
                throw new TypeError('Too few arguments passed to function call');
            } else if (this.params.length < paramTypes.length) {
                throw new TypeError('Too many arguments passed to function call');
            }
            for (var i = 0; i < this.params.length; i++) {
                if (!this.params[i].getType(ctx).equals(paramTypes[i])) {
                    throw new TypeError('Wrong type passed as parameter to function call');
                }
            }
        }
    },
    Member: {
        traverse: function(cb) {
            cb(this.base, 'base');
        },
        substitute: function(cb) {
            this.base = cb(this.base, 'base') || this.base;
        },
        getType: function(ctx) {
            var base = this.base.getType(ctx);
            if (!this.child in base.members) {
                throw new Error('Member not found for type "' + base.name + '": ' + this.child);
            }
            return base.members[this.child];
        },
        validateTypes: function(ctx) {
            this.base.validateTypes(ctx);
            // TODO: ???
        }
    },
    Assignment: {
        traverse: function(cb) {
            cb(this.base, 'base');
            cb(this.value, 'value');
        },
        substitute: function(cb) {
            this.base = cb(this.base, 'base') || this.base;
            this.value = cb(this.value, 'value') || this.value;
        },
        getType: function(ctx) {
            // TODO: Check that base and value are the same type.
            return this.value.getType(ctx);
        },
        validateTypes: function(ctx) {
            var baseType = this.base.getType(ctx);
            if (!baseType.equals(this.value.getType(ctx))) {
                throw new TypeError('Mismatched types in assignment');
            }
        }
    },
    Declaration: {
        traverse: function(cb) {
            if (this.declType && this.declType.type)
                cb(this.declType, 'type');
            cb(this.value, 'value');
        },
        substitute: function(cb) {
            this.value = cb(this.value, 'value') || this.value;
        },
        validateTypes: function(ctx) {
            this.value.validateTypes(ctx);
            if (!this.declType) return;
            var valueType = this.value.getType(ctx);
            if (!valueType.equals(this.declType)) {
                throw new TypeError('Mismatched types in declaration');
            }
        }
    },
    Return: {
        traverse: function(cb) {
            if (this.value)
                cb(this.value);
        },
        substitute: function(cb) {
            if (!this.value) return;
            this.value = cb(this.value, 'value') || this.value;
        },
        validateTypes: function(ctx) {
            this.value.validateTypes(ctx);
            var valueType = this.value.getType(ctx);
            var func = ctx.scope;
            if (!!valueType !== !!func.returnType) {
                throw new TypeError('Mismatched void/typed return type');
            }
            if (!func.returnType.equals(valueType)) {
                throw new TypeError('Mismatched return type');
            }
        }
    },
    Export: {
        traverse: function(cb) {
            cb(this.value);
        },
        substitute: function() {},
        validateTypes: function(ctx) {
            this.value.validateTypes(ctx);
            var valueType = this.value.getType(ctx);
            if (valueType.name !== 'func') {
                throw new TypeError('Cannot export non-executable objects');
            }
        }
    },
    Import: {
        traverse: function(cb) {
            cb(this.base, 'base');
            if (this.member) cb(this.member, 'member');
            if (this.alias) cb(this.alias, 'alias');
        },
        substitute: function() {},
        validateTypes: function(ctx) {
            this.base.validateTypes(ctx);
            if (this.member) this.member.validateTypes(ctx);
            if (this.alias) this.alias.validateTypes(ctx);
        }
    },
    For: {
        traverse: loop_traverser,
        substitute: loop_substitution,
        validateTypes: loopValidator
    },
    DoWhile: {
        traverse: loop_traverser,
        substitute: loop_substitution,
        validateTypes: loopValidator
    },
    While: {
        traverse: loop_traverser,
        substitute: loop_substitution,
        validateTypes: loopValidator
    },
    Switch: {
        traverse: function(cb) {
            cb(this.condition, 'condition');
            this.cases.forEach(cb);
        },
        substitute: function(cb) {
            this.condition = cb(this.condition, 'condition') || this.condition;
            this.cases = this.cases.map(function(case_) {
                return cb(case_, 'case');
            }).filter(ident);
        },
        validateTypes: function(ctx) {
            this.cases.forEach(function(c) {
                c.validateTypes(ctx);
            });
        }
    },
    Case: {
        traverse: function(cb) {
            cb(this.value, 'value');
            this.body.forEach(cb);
        },
        substitute: function(cb) {
            this.value = cb(this.value, 'value') || this.value;
            this.body = this.body.map(function(stmt) {
                return cb(stmt, 'stmt');
            }).filter(ident);
        },
        validateTypes: function(ctx) {
            this.body.forEach(function(stmt) {
                stmt.validateTypes(ctx);
            });
        }
    },
    If: {
        traverse: function(cb) {
            cb(this.condition, 'condition');
            this.consequent.forEach(cb);
            if (this.alternate)
                this.alternate.forEach(cb);
        },
        substitute: function(cb) {
            this.condition = cb(this.condition, 'condition') || this.condition;
            this.consequent = this.consequent.map(function(stmt) {
                return cb(stmt, 'consequent');
            }).filter(ident);
            if (!this.alternate) return;
            this.alternate = this.alternate.map(function(stmt) {
                return cb(stmt, 'alternate');
            }).filter(ident);
        },
        validateTypes: function(ctx) {
            this.condition.validateTypes(ctx);
            if(!this.condition.getType(ctx).equals(new type('bool')))
                throw new TypeError('Unexpected type passed as condition');
            this.consequent.forEach(function(stmt) {
                stmt.validateTypes(ctx);
            });
            if (this.alternate) {
                this.alternate.forEach(function(stmt) {
                    stmt.validateTypes(ctx);
                });
            }
        }
    },
    'Function': {
        traverse: function(cb) {
            if (this.returnType)
                cb(this.returnType, 'return');
            // this.params.forEach(cb);
            this.body.forEach(cb);
        },
        substitute: function(cb) {
            this.body = this.body.map(function(stmt) {
                return cb(stmt, 'stmt');
            }).filter(ident);
        },
        getType: function(ctx) {
            var returnType = this.returnType;
            return new type(
                'func',
                [returnType].concat(this.params.map(function(p) {
                    return p.getType(ctx);
                }))
            );
        },
        validateTypes: function(ctx) {
            var context = this.__context;
            this.body.forEach(function(stmt) {
                stmt.validateTypes(context);
            });
        }
    },
    Type: {
        traverse: function(cb) {
            this.traits.forEach(cb);
        },
        substitute: function() {},
        getType: function() {
            return new type(this.name, this.traits);
        },
        validateTypes: function() {}
    },
    TypedIdentifier: {
        traverse: function(cb) {
            cb(this.idType);
        },
        substitute: function() {},
        getType: function() {
            return this.idType;
        },
        validateTypes: function() {}
    },
    Literal: {
        traverse: function(cb) {},
        substitute: function() {},
        getType: function() {
            return new type(this.litType);
        },
        validateTypes: function() {}
    },
    Symbol: {
        traverse: function(cb) {},
        substitute: function() {},
        getType: function(ctx) {
            var objContext = ctx.lookupVar(this.name);
            return objContext.vars[this.name];
        },
        validateTypes: function() {}
    },
    New: {
        traverse: function(cb) {
            if (this.newType && this.newType.type)
                cb(this.newType);
            this.params.forEach(cb);
        },
        substitute: function(cb) {
            this.callee = cb(this.callee, 'callee') || this.callee;
            this.params = this.params.map(function(stmt) {
                return cb(stmt, 'params');
            }).filter(ident);
        },
        getType: function(ctx) {
            return this.newType;
        },
        validateTypes: function() {
            // TODO: Check that the params match the params of the constructor
        }
    }
};

function buildNode(proto, name) {
    function node(start, end, base) {
        this.type = name;
        this.start = start;
        this.end = end;
        this.__base = base;
        for(var prop in base) {
            this[prop] = base[prop];
        }
    }
    for(var protoMem in proto) {
        node.prototype[protoMem] = proto[protoMem];
    }
    node.prototype.clone = function() {
        var out = new node(
            this.start,
            this.end,
            {}
        );
        for (var item in this.__base) {
            if (this.__base[item].clone) {
                out[item] = this.__base[item].clone();
            } else {
                out[item] = this.__base[item];
            }
            out.__base[item] = out[item];
        }
    };
    return node;
}

var preparedNodes = module.exports = {};
for(var node in NODES) {
    preparedNodes[node] = buildNode(NODES[node], node);
}
