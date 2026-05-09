'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { Trip } from '@/types';
import { ShareCard } from './ShareCard';
import { createShareLink } from '@/lib/shareLink';
import { isFirebaseConfigured } from '@/lib/firebase';

type Tab = 'export' | 'import' | 'share' | 'pdf' | 'link';

interface Props {
  onClose: () => void;
}

function encode(trip: Trip): string {
  return btoa(encodeURIComponent(JSON.stringify(trip)));
}

function decode(raw: string): Trip {
  const json = decodeURIComponent(atob(raw.trim()));
  const data = JSON.parse(json) as unknown;
  if (
    !data || typeof data !== 'object' ||
    !('id' in data) || !('days' in data) ||
    !Array.isArray((data as Record<string, unknown>).days)
  ) throw new Error('Invalid trip data');
  return data as Trip;
}

// ── Slim trip for QR ────────────────────────────────────────────────────────
// Strip large fields (photoUrl, openingHours, commutePolyline, editorialSummary)
// to keep the payload small enough for a scannable QR code.
function slimForQr(trip: Trip): string {
  const t = {
    ...trip,
    days: trip.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) => ({
        ...a,
        commutePolyline: undefined,
        place: a.place
          ? { placeId: a.place.placeId, name: a.place.name, address: a.place.address, lat: a.place.lat, lng: a.place.lng }
          : undefined,
      })),
    })),
  };
  return btoa(encodeURIComponent(JSON.stringify(t)));
}

// ── QR code (lazy) ───────────────────────────────────────────────────────────
async function makeQr(trip: Trip): Promise<string | null> {
  const QRCode = (await import('qrcode')).default;
  try {
    return await QRCode.toDataURL(slimForQr(trip), {
      margin: 1, width: 200, errorCorrectionLevel: 'L',
    });
  } catch {
    return null; // trip still too large — QR is optional
  }
}

// ── html2canvas capture → PNG download ──────────────────────────────────────
async function captureAndDownload(el: HTMLElement, filename: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, {
    useCORS: true,
    allowTaint: false,
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
  });
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

// ── jsPDF via html2canvas (handles CJK text natively) ───────────────────────
async function captureAndExportPdf(el: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas   = await html2canvas(el, { useCORS: true, allowTaint: false, scale: 2, backgroundColor: '#ffffff', logging: false });
  const imgData  = canvas.toDataURL('image/png');
  const A4_W     = 210;  // mm
  const A4_H     = 297;
  const imgW     = A4_W;
  const imgH     = (canvas.height / canvas.width) * imgW;
  const pages    = Math.ceil(imgH / A4_H);
  const pdf      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  for (let p = 0; p < pages; p++) {
    if (p > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -(p * A4_H), imgW, imgH);
  }
  pdf.save(filename);
}

// ── ExportModal ───────────────────────────────────────────────────────────────
export function ExportModal({ onClose }: Props) {
  const trip     = useTripStore((s) => s.trip);
  const loadTrip = useTripStore((s) => s.loadTrip);
  const user     = useAuthStore((s) => s.user);

  const [tab, setTab]             = useState<Tab>('export');
  const [shareUrl, setShareUrl]   = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError]   = useState('');
  const [copied, setCopied]     = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState('');
  const [qrDataUrl, setQrDataUrl]   = useState<string | null>(null);
  const [qrLoading, setQrLoading]   = useState(false);
  const [capturing, setCapturing]   = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const encoded = useMemo(() => encode(trip), [trip]);

  // Pre-generate QR once the share/pdf tab is opened
  useEffect(() => {
    if ((tab === 'share' || tab === 'pdf') && qrDataUrl === null && !qrLoading) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQrLoading(true);
      makeQr(trip)
        .then((url) => { setQrDataUrl(url); setQrLoading(false); })
        .catch(() => setQrLoading(false));
    }
  }, [tab, trip, qrDataUrl, qrLoading]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(encoded);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = () => {
    try {
      loadTrip(decode(importText));
      onClose();
    } catch {
      setImportError('格式无效，请确认数据来自 YoteiTrip 导出');
    }
  };

  const handleDownloadImage = async () => {
    if (!shareCardRef.current || capturing) return;
    setCapturing(true);
    try {
      await captureAndDownload(shareCardRef.current, `${trip.name}-分享图.png`);
    } finally {
      setCapturing(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!shareCardRef.current || capturing) return;
    setCapturing(true);
    try {
      await captureAndExportPdf(shareCardRef.current, `${trip.name}-路书.pdf`);
    } finally {
      setCapturing(false);
    }
  };

  const handleGenerateLink = async () => {
    setShareError('');
    setShareLoading(true);
    try {
      const id  = await createShareLink(trip, user?.uid ?? null);
      const url = `${window.location.origin}/share/${id}`;
      setShareUrl(url);
    } catch {
      setShareError('生成失败，请确认 Firebase 已配置并重试');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'export', label: '导出数据' },
    { key: 'import', label: '导入'   },
    { key: 'link',   label: '🔗 分享' },
    { key: 'share',  label: '分享图'  },
    { key: 'pdf',    label: 'PDF路书' },
  ];

  return (
    <>
      {/* ── Off-screen ShareCard (always rendered so ref is valid) ── */}
      <ShareCard ref={shareCardRef} trip={trip} qrDataUrl={qrDataUrl} />

      {/* ── Modal sheet ── */}
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-[480px] bg-white rounded-t-3xl flex flex-col max-h-[80dvh]">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3 pt-1">
            <h2 className="text-base font-semibold text-gray-900">数据 &amp; 分享</h2>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors">✕</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 px-5 pb-3 overflow-x-auto">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-none ${
                  tab === key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pb-8 flex flex-col gap-4">

            {/* ── Export data ── */}
            {tab === 'export' && (
              <>
                <p className="text-sm text-gray-500">将行程编码为文本字符串。可复制发给好友，或保存为备份。</p>
                <textarea readOnly value={encoded}
                  className="w-full h-28 text-[11px] font-mono bg-gray-50 rounded-2xl border border-gray-200 p-3 resize-none text-gray-500 outline-none" />
                <button onClick={handleCopy}
                  className={`w-full py-3.5 rounded-2xl text-sm font-medium transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}>
                  {copied ? '✓ 已复制到剪贴板' : '复制行程数据'}
                </button>
              </>
            )}

            {/* ── Import ── */}
            {tab === 'import' && (
              <>
                <p className="text-sm text-gray-500">
                  粘贴从好友处收到的行程字符串。
                  <span className="text-orange-500"> 导入后将替换当前全部行程，不可撤销。</span>
                </p>
                <textarea value={importText} onChange={(e) => { setImportText(e.target.value); setImportError(''); }}
                  placeholder="粘贴行程字符串..."
                  className="w-full h-28 text-[11px] font-mono bg-gray-50 rounded-2xl border border-gray-200 p-3 resize-none text-gray-700 placeholder-gray-300 outline-none focus:border-gray-400" />
                {importError && <p className="text-xs text-red-400">{importError}</p>}
                <button onClick={handleImport} disabled={!importText.trim()}
                  className="w-full py-3.5 rounded-2xl text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                  导入行程
                </button>
              </>
            )}

            {/* ── Share link ── */}
            {tab === 'link' && (
              <>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium text-gray-700">🔗 生成可分享链接</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    任何人通过此链接均可预览行程并一键导入到 YoteiTrip，无需登录。
                    链接保存在云端，永久有效。
                  </p>
                  {!isFirebaseConfigured() && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
                      ⚠️ 需要配置 Firebase 才能使用云端分享功能
                    </p>
                  )}
                </div>

                {/* Generated URL */}
                {shareUrl && (
                  <div className="rounded-2xl border border-[#47BB8E]/30 bg-[#F0F7F4] px-4 py-3 flex flex-col gap-2">
                    <p className="text-[11px] text-gray-400">分享链接</p>
                    <p className="text-xs font-mono text-gray-700 break-all leading-relaxed">
                      {shareUrl}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={handleCopyLink}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                          shareCopied
                            ? 'bg-[#47BB8E] text-white'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-gray-400'
                        }`}
                      >
                        {shareCopied ? '✓ 已复制' : '复制链接'}
                      </button>
                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2 rounded-xl text-xs font-medium text-center bg-white border border-gray-200 text-gray-700 hover:border-gray-400 transition-colors"
                      >
                        在新标签打开 ↗
                      </a>
                    </div>
                  </div>
                )}

                {shareError && <p className="text-xs text-red-400">{shareError}</p>}

                <button
                  onClick={handleGenerateLink}
                  disabled={shareLoading || !isFirebaseConfigured()}
                  className="w-full py-3.5 rounded-2xl text-sm font-medium text-white disabled:opacity-40 active:scale-[0.99] transition-all"
                  style={{ backgroundColor: '#3D5568' }}
                >
                  {shareLoading ? '生成中…' : shareUrl ? '重新生成链接' : '生成分享链接'}
                </button>
              </>
            )}

            {/* ── Share image ── */}
            {tab === 'share' && (
              <>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium text-gray-700">社交分享长图</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    包含路线地图、景点卡片（含 AI 简介 & 封面照片）、全程里程统计，以及可扫码导入的二维码。
                  </p>
                  {/* QR preview */}
                  {qrDataUrl && (
                    <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="QR" className="w-16 h-16 rounded" />
                      <div>
                        <p className="text-xs font-medium text-gray-700">扫码导入行程</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">好友扫描后可直接导入 YoteiTrip</p>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleDownloadImage}
                  disabled={capturing || qrLoading}
                  className="w-full py-3.5 rounded-2xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 active:scale-[0.99] transition-all"
                >
                  {qrLoading ? 'QR 生成中…' : capturing ? '生成中…' : '⬇ 下载分享长图 PNG'}
                </button>
              </>
            )}

            {/* ── PDF ── */}
            {tab === 'pdf' && (
              <>
                <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex flex-col gap-3">
                  <p className="text-sm font-medium text-gray-700">专业 PDF 路书</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    将行程导出为分页 PDF，包含路线地图、活动详情、预估费用，并附含二维码品牌页。
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[['📅', `${trip.days.length} 天`], ['📌', `${trip.days.flatMap(d => d.activities.filter(a => !a.isBackup && a.place?.name)).length} 景点`],
                      ['🗺️', '路书格式']].map(([icon, text]) => (
                      <div key={text} className="bg-white rounded-xl p-2.5 border border-gray-100">
                        <p className="text-lg leading-none mb-1">{icon}</p>
                        <p className="text-xs text-gray-600">{text}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleDownloadPdf}
                  disabled={capturing || qrLoading}
                  className="w-full py-3.5 rounded-2xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 active:scale-[0.99] transition-all"
                >
                  {qrLoading ? 'QR 生成中…' : capturing ? '生成中…' : '⬇ 生成 PDF 路书'}
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
