"use strict";

const fs = require("node:fs");
const path = require("node:path");

const packageFile = path.join(__dirname, "..", "ios", "App", "CapApp-SPM", "Package.swift");
const source = fs.readFileSync(packageFile, "utf8");
const normalized = source.replace(
  /(\.package\(name:\s*"CapacitorTokenVault",\s*path:\s*")([^"]+)("\))/,
  (_, prefix, pluginPath, suffix) => `${prefix}${pluginPath.replace(/\\/g, "/")}${suffix}`
);

if (!normalized.includes('.package(name: "CapacitorTokenVault"')) throw new Error("CapacitorTokenVault Swift package registration is missing");
if (/CapacitorTokenVault",\s*path:\s*"[^"]*\\/.test(normalized)) throw new Error("Generated Swift package path is not portable");
if (normalized !== source) fs.writeFileSync(packageFile, normalized);
