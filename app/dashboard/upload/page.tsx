"use client";

import { StatementUpload } from "@/components/statement-upload";
import { UploadedStatementsList } from "@/components/uploaded-statements-list";
import { motion } from "framer-motion";

export default function UploadPage() {
  return (
    <div className="min-h-[80vh] bg-gradient-to-b from-[#08051a] via-[#10082a] to-[#160e35]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <StatementUpload />
        <div className="mx-auto max-w-3xl">
          <UploadedStatementsList />
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto"
        >
          {[
            {
              title: "Multi-Format Support",
              desc: "CSV, XLS, XLSX, and PDF statements from any bank worldwide",
              color: "#0BC18D",
            },
            {
              title: "AI-Powered Extraction",
              desc: "Gemini 2.0 identifies merchants, currencies, and spending patterns",
              color: "#2CA2FF",
            },
            {
              title: "FX Spread Detection",
              desc: "Uncover hidden foreign exchange fees your bank doesn't show you",
              color: "#AD74FF",
            },
          ].map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div
                className="w-2 h-2 rounded-full mb-3"
                style={{ backgroundColor: feature.color }}
              />
              <h3 className="text-sm font-semibold text-white/90 mb-1">{feature.title}</h3>
              <p className="text-[11px] text-white/60 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
