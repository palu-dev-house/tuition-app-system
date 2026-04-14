"use client";

import { createTheme, NumberInput } from "@mantine/core";

export function createAppTheme(fontFamily: string) {
  return createTheme({
    fontFamily,
    headings: { fontFamily },
    components: {
      NumberInput: NumberInput.extend({
        defaultProps: {
          hideControls: true,
          thousandSeparator: true,
        },
      }),
    },
  });
}
