"use client";

import type { ComponentProps } from "react";

export function AutoSubmitSelect({ onChange, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      onChange={(event) => {
        onChange?.(event);
        event.currentTarget.form?.requestSubmit();
      }}
    />
  );
}

