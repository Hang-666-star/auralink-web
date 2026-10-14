'use client';
import { useEffect, useRef, useState } from 'react';
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; abort: () => void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null };
type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function useBrowserSpeech(onTranscript: (text: string) => void, onError: (error: string) => void) {
  const [supported, setSupported] = useState(false); const [readable, setReadable] = useState(false); const [listening, setListening] = useState(false); const [speaking, setSpeaking] = useState(false);
  const recognition = useRef<Recognition | null>(null); const transcript = useRef(onTranscript); transcript.current = onTranscript;
  useEffect(() => {
    const browser = window as SpeechWindow; setSupported(!!(browser.SpeechRecognition || browser.webkitSpeechRecognition)); setReadable('speechSynthesis' in window);
    return () => { if (recognition.current) { recognition.current.onend = null; recognition.current.onresult = null; recognition.current.onerror = null; recognition.current.abort(); } window.speechSynthesis?.cancel(); };
  }, []);
  const stop = () => { recognition.current?.abort(); window.speechSynthesis?.cancel(); setListening(false); setSpeaking(false); };
  const listen = () => {
    const Constructor = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition; if (!Constructor) return;
    if (listening) { stop(); return; }
    const next = new Constructor(); recognition.current = next; next.lang = 'zh-CN'; next.continuous = false; next.interimResults = false;
    next.onresult = event => { const text = Array.from(event.results).map(result => result[0]?.transcript || '').join(''); transcript.current(text); };
    next.onerror = event => { setListening(false); onError(event.error === 'not-allowed' ? '浏览器未获得麦克风权限；仍可直接输入文字。' : `语音输入未完成（${event.error}），请检查浏览器支持与权限。`); };
    next.onend = () => setListening(false); // Never submit automatically: user confirms the composer.
    try { next.start(); setListening(true); } catch { onError('浏览器暂时无法开始语音输入。'); }
  };
  const read = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); const value = new SpeechSynthesisUtterance(text); value.lang = 'zh-CN'; value.onend = () => setSpeaking(false); value.onerror = () => { setSpeaking(false); onError('朗读未完成，可以重新开始或直接阅读文字。'); }; window.speechSynthesis.speak(value); setSpeaking(true);
  };
  return { supported, readable, listening, speaking, listen, read, stop };
}
