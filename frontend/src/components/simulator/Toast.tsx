"use client";
import { useState } from "react";
import styles from "./Toast.module.css";

export interface ToastMessage {
  id:    number;
  text:  string;
  error: boolean;
}

interface Props {
  messages: ToastMessage[];
  onDismiss: (id: number) => void;
}

export default function Toast({ messages, onDismiss }: Props) {
  return (
    <div className={styles.container}>
      {messages.map(m => (
        <div key={m.id} className={`${styles.toast} ${m.error ? styles.err : styles.info}`}>
          <span>{m.text}</span>
          <button className={styles.close} onClick={() => onDismiss(m.id)}>✕</button>
        </div>
      ))}
    </div>
  );
}

/** Hook: returns [messages, push(text, isError)] */
export function useToast(): [ToastMessage[], (text: string, error?: boolean) => void] {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const push = (text: string, error = false) => {
    const id = Date.now();
    setMessages(prev => [...prev, { id, text, error }]);
    setTimeout(() => setMessages(prev => prev.filter(m => m.id !== id)), 4000);
  };

  return [messages, push];
}
