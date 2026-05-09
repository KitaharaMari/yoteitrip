'use client';

import { motion } from 'framer-motion';
import type { CloudData } from '@/lib/firestore';

interface Props {
  cloudData:   CloudData;
  localTrips:  number;   // count of local trips for display
  onUseCloud:  () => void;
  onUseLocal:  () => void;
}

export function SyncConflictModal({ cloudData, localTrips, onUseCloud, onUseLocal }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[60] flex items-center justify-center px-6 bg-black/50"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl flex flex-col gap-4"
      >
        <div className="text-center">
          <span className="text-3xl">☁️</span>
          <h3 className="text-base font-semibold text-gray-900 mt-2">发现云端数据</h3>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            此账号的云端已有行程，与本机游客数据不同。<br />请选择保留哪份数据。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {/* Use cloud */}
          <button
            onClick={onUseCloud}
            className="w-full px-4 py-3.5 rounded-2xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 active:scale-[0.98] transition-all text-left flex justify-between items-center"
          >
            <div>
              <p>使用云端数据</p>
              <p className="text-[11px] text-gray-400 mt-0.5 font-normal">
                {cloudData.trips.length} 个行程 · 上次同步 {cloudData.savedAt ? new Date(cloudData.savedAt).toLocaleDateString('zh-CN') : '未知'}
              </p>
            </div>
            <span className="text-gray-400 text-lg">☁️</span>
          </button>

          {/* Use local */}
          <button
            onClick={onUseLocal}
            className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm font-medium text-gray-700 hover:border-gray-400 active:scale-[0.98] transition-all text-left flex justify-between items-center"
          >
            <div>
              <p>保留本机数据并上传</p>
              <p className="text-[11px] text-gray-400 mt-0.5 font-normal">
                {localTrips} 个本地行程 · 覆盖云端
              </p>
            </div>
            <span className="text-gray-400 text-lg">📱</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
