"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  cartridgeFormatKey,
  cartridgeFormatLabels,
} from "../template-metadata";
export function CartridgeFormatFields() {
  const [format, setFormat] = useState("unspecified");
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 font-medium">Cartridge format and variant</legend>
      <label className="block">
        Cartridge format
        <select
          name="cartridgeFormat"
          aria-label="Cartridge format"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          className="block min-h-12 w-full min-w-0 rounded-lg border border-input bg-background px-3"
        >
          {cartridgeFormatKey.options.map((key) => (
            <option key={key} value={key}>
              {cartridgeFormatLabels[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        Shell variant
        <Input
          name="cartridgeVariant"
          maxLength={200}
          required={format === "other"}
          aria-describedby="cartridge-format-note"
        />
      </label>
      <p id="cartridge-format-note" className="text-sm text-muted-foreground">
        Identify the model’s shell revision or market variant. Describe an Other
        format here. Supply dimensions and label mappings from the actual model;
        the format choice provides no measurements. Cartridge family revision
        numbers are shared across formats.
      </p>
    </fieldset>
  );
}
