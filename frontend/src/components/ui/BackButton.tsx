import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface BackButtonProps {
  onClick?: () => void;
  className?: string;
  label?: React.ReactNode;
  variant?: any;
  size?: any;
  ariaLabel?: string;
}

// Simple DOM-scoped singleton: only the first mounted BackButton will render visibly.
// This uses a counter stored on document.body.dataset to reduce duplicate back buttons across a page.
export default function BackButton({ onClick, className, label, variant, size, ariaLabel }: BackButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") {
      setVisible(true);
      return;
    }

    const ds = document.body.dataset;
    const count = parseInt(ds.__bb_back_button_count || "0", 10);
    // If no other back button mounted, show this one
    const shouldShow = count === 0;
    setVisible(shouldShow);
    ds.__bb_back_button_count = String(count + 1);

    return () => {
      const cur = parseInt(ds.__bb_back_button_count || "1", 10);
      const next = Math.max(0, cur - 1);
      ds.__bb_back_button_count = String(next);
      if (next === 0) delete ds.__bb_back_button_count;
    };
  }, []);

  if (!visible) return null;

  // If a label was provided render a full button, otherwise render an icon-only button
  if (label) {
    return (
      <Button onClick={onClick} variant={variant} className={className} aria-label={ariaLabel}>
        {label}
      </Button>
    );
  }

  return (
    <Button onClick={onClick} variant={variant} size={size} className={className} aria-label={ariaLabel}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
  );
}
