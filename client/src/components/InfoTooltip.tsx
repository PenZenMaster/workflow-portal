/*
 * Module/Script Name: InfoTooltip.tsx
 * Path: client/src/components/InfoTooltip.tsx
 *
 * Description:
 * Small inline (?) icon that shows an explanatory tooltip on hover/focus.
 * Used next to form labels and setup controls where a short "what is this"
 * note helps operators unfamiliar with the tool (B-24).
 *
 * Author(s): Rank Rocket Co (C) Copyright 2026 - All Rights Reserved
 * Created Date: 2026-08-18
 * Last Modified Date: 2026-08-18
 * Comments:
 * - v1.00 Initial implementation (B-24)
 */

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  text: string;
  label: string;
};

export function InfoTooltip({ text, label }: Props) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
    </Tooltip>
  );
}
