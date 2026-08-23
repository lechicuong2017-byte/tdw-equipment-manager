"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

const interactiveSelector = "a, button, input, select, textarea, label, form";

export function InteractiveTableRow({
  children,
  className = "",
  title = "Bấm để xem chi tiết",
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const openDetail = (
    currentTarget: HTMLTableRowElement,
    target: EventTarget | null,
  ) => {
    if (target instanceof Element && target.closest(interactiveSelector)) return;
    currentTarget
      .querySelector<HTMLButtonElement>(".row-detail-trigger")
      ?.click();
  };

  const handleClick = (event: MouseEvent<HTMLTableRowElement>) => {
    openDetail(event.currentTarget, event.target);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openDetail(event.currentTarget, null);
  };

  return (
    <tr
      className={`interactive-data-row ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      title={title}
    >
      {children}
    </tr>
  );
}
