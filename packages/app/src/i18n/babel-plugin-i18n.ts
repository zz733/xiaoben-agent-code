import type { PluginObj, NodePath } from "@babel/core";
import type { StringLiteral, JSXText } from "@babel/types";

interface StringMapping {
  [originalText: string]: string;
}

let cachedMapping: StringMapping | null = null;

function loadMapping(): StringMapping {
  if (cachedMapping) return cachedMapping;
  try {
    const fs = require("fs");
    const path = require("path");
    const mappingPath = path.join(__dirname, "..", "src", "i18n", "string-map.json");
    if (fs.existsSync(mappingPath)) {
      cachedMapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
    }
  } catch {}
  return cachedMapping ?? {};
}

function shouldSkip(path: NodePath): boolean {
  let current: NodePath | null = path;
  while (current) {
    if (current.isImportDeclaration()) return true;
    if (current.isCallExpression()) {
      const callee = current.get("callee");
      if (callee.isIdentifier() && callee.node.name === "t") return true;
      if (callee.isMemberExpression()) {
        const prop = callee.get("property");
        if (prop.isIdentifier() && prop.node.name === "t") return true;
      }
    }
    if (current.isFunctionDeclaration()) return true;
    if (current.isReturnStatement()) return true;
    current = current.parentPath;
  }
  return false;
}

const I18N_MIN_LENGTH = 3;
const SKIP_PATTERNS = [
  /^[a-z-]+$/,
  /^\d+$/,
  /^https?:/,
  /^\//,
  /^\./,
  /^@/,
  /^#/,
  /^\{.*\}$/,
  /^<.*>$/,
  /^[A-Z_]+$/,
  /^[a-z]+([A-Z][a-z]*)+$/,
];

function isTranslatable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < I18N_MIN_LENGTH) return false;
  if (SKIP_PATTERNS.some((p) => p.test(trimmed))) return false;
  if (/^[a-z]$/.test(trimmed)) return false;
  return /[a-zA-Z]{2,}/.test(trimmed) && /\s/.test(trimmed);
}

export default function babelPluginI18n(): PluginObj {
  return {
    name: "paseo-i18n",
    visitor: {
      JSXText(path: NodePath<JSXText>) {
        const text = path.node.value;
        if (!isTranslatable(text)) return;
        if (shouldSkip(path)) return;

        const mapping = loadMapping();
        const key = mapping[text.trim()];
        if (!key) return;

        const { callExpression, identifier, stringLiteral } = require("@babel/types");
        path.replaceWith(callExpression(identifier("t"), [stringLiteral(key)]));
      },
      StringLiteral(path: NodePath<StringLiteral>) {
        const text = path.node.value;
        if (!isTranslatable(text)) return;
        if (shouldSkip(path)) return;

        if (path.parentPath.isJSXAttribute()) return;
        if (path.parentPath.isObjectProperty()) return;
        if (path.parentPath.isArrayExpression()) return;
        if (path.parentPath.isVariableDeclarator()) return;
        if (path.parentPath.isReturnStatement()) return;
        if (path.parentPath.isCallExpression()) {
          const callee = path.parentPath.get("callee");
          if (
            callee.isIdentifier() &&
            ["toast", "Alert", "console", "log", "warn", "error"].includes(callee.node.name)
          )
            return;
        }

        const mapping = loadMapping();
        const key = mapping[text.trim()];
        if (!key) return;

        const { callExpression, identifier, stringLiteral } = require("@babel/types");
        path.replaceWith(callExpression(identifier("t"), [stringLiteral(key)]));
      },
    },
  };
}
