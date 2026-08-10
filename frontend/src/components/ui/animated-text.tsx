import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface AnimatedTextProps {
  staticText?: string;
  texts: string[];
  className?: string;
  interval?: number;
}

export const AnimatedText = ({
  staticText = "",
  texts,
  className = "",
  interval = 3000,
}: AnimatedTextProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, interval);

    return () => clearInterval(timer);
  }, [texts.length, interval]);

  return (
    <div className={`flex items-center text-4xl tracking-tight ${className}`}>
      {staticText && (
        <span className="font-light tracking-tighter mr-[6px]">{staticText}</span>
      )}
      <div className="relative">
        <AnimatePresence mode="wait">
          <motion.span
            key={currentIndex}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{
              y: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="font-medium tracking-tight"
          >
            {texts[currentIndex]}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}; 