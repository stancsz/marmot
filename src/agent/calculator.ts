/**
 * Safe arithmetic evaluator (shunting-yard) — no eval(), no Function().
 * Supports + - * / % ^ and parentheses over decimal numbers.
 */
type Token = { type: 'num'; value: number } | { type: 'op'; value: string } | { type: 'paren'; value: '(' | ')' }

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }
const RIGHT_ASSOC = new Set(['^'])

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      const raw = expr.slice(i, j)
      const value = Number(raw)
      if (!Number.isFinite(value)) throw new Error(`Invalid number: ${raw}`)
      tokens.push({ type: 'num', value })
      i = j
      continue
    }
    if (ch === '(' || ch === ')') {
      tokens.push({ type: 'paren', value: ch })
      i++
      continue
    }
    if (ch in PRECEDENCE) {
      // unary minus: treat "-x" as "0 - x" at expression/paren start
      const prev = tokens[tokens.length - 1]
      if (ch === '-' && (!prev || prev.type === 'op' || (prev.type === 'paren' && prev.value === '('))) {
        tokens.push({ type: 'num', value: 0 })
      }
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }
    throw new Error(`Unexpected character: ${ch}`)
  }
  return tokens
}

export function evaluate(expr: string): number {
  const output: number[] = []
  const ops: string[] = []

  const apply = (op: string) => {
    const b = output.pop()
    const a = output.pop()
    if (a === undefined || b === undefined) throw new Error('Malformed expression')
    switch (op) {
      case '+': output.push(a + b); break
      case '-': output.push(a - b); break
      case '*': output.push(a * b); break
      case '/':
        if (b === 0) throw new Error('Division by zero')
        output.push(a / b)
        break
      case '%': output.push(a % b); break
      case '^': output.push(Math.pow(a, b)); break
      default: throw new Error(`Unknown operator ${op}`)
    }
  }

  for (const token of tokenize(expr)) {
    if (token.type === 'num') output.push(token.value)
    else if (token.type === 'op') {
      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== '(' &&
        (PRECEDENCE[ops[ops.length - 1]] > PRECEDENCE[token.value] ||
          (PRECEDENCE[ops[ops.length - 1]] === PRECEDENCE[token.value] && !RIGHT_ASSOC.has(token.value)))
      ) {
        apply(ops.pop()!)
      }
      ops.push(token.value)
    } else if (token.value === '(') ops.push('(')
    else {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') apply(ops.pop()!)
      if (ops.pop() !== '(') throw new Error('Mismatched parentheses')
    }
  }
  while (ops.length > 0) {
    const op = ops.pop()!
    if (op === '(') throw new Error('Mismatched parentheses')
    apply(op)
  }
  if (output.length !== 1) throw new Error('Malformed expression')
  return output[0]
}
