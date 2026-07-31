"use client";

import { startTransition, type ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";

export function InstantFilterForm({ onSubmit, ...props }: ComponentProps<"form">) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <form
      {...props}
      onSubmit={(event) => {
        onSubmit?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();

        const params = new URLSearchParams();
        const formData = new FormData(event.currentTarget);
        for (const [name, value] of formData.entries()) {
          if (typeof value === "string" && value.trim()) {
            params.set(name, value.trim());
          }
        }

        const query = params.toString();
        startTransition(() => {
          router.replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
          });
        });
      }}
    />
  );
}

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
