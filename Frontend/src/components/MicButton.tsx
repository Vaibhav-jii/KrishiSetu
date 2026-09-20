import React from "react";
import { Mic } from "lucide-react";

interface MicButtonProps {
  onClick: () => void;
  visible: boolean;
}

export default function MicButton({ onClick, visible }: MicButtonProps) {
  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes mic-pulse-ring {
          0% { transform: scale(0.95); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0.3; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        .animate-mic-pulse {
          animation: mic-pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .mic-glow {
          box-shadow: 0 0 20px -2px rgba(45, 90, 27, 0.45);
        }
        .mic-glow:hover {
          box-shadow: 0 0 25px 0px rgba(45, 90, 27, 0.6);
        }
      `}</style>
      <button
        onClick={onClick}
        aria-label="Open voice assistant"
        className="fixed z-40 bottom-6 right-6 transition-transform active:scale-95 duration-200"
      >
        <span className="relative grid place-items-center w-14 h-14 rounded-full bg-[#2d5a1b] text-white mic-glow transition-all">
          <span className="absolute inset-0 rounded-full bg-[#2d5a1b]/40 animate-mic-pulse" />
          <span className="absolute inset-0 rounded-full bg-[#2d5a1b]/20 animate-mic-pulse" style={{ animationDelay: "0.8s" }} />
          <Mic size={24} />
        </span>
      </button>
    </>
  );
}
