"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Simple inline SVG icons to avoid extra deps
function CheckCircleIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
			<path d="M8 12.5l2.5 2.5L16.5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ExclamationCircleIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
			<path d="M12 7v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
			<circle cx="12" cy="17" r="1.5" fill="currentColor" />
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
		>
			<path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
		</svg>
	);
}

export type NotificationType = "success" | "error";

export type NotificationOptions = {
	title: string;
	description?: string;
	durationMs?: number; // auto-dismiss; default 5000
	id?: string; // optional custom id
};

export type NotificationItem = NotificationOptions & {
	id: string;
	type: NotificationType;
	createdAtMs: number;
};

export type NotificationsApi = {
	success: (options: NotificationOptions) => string;
	error: (options: NotificationOptions) => string;
	close: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsApi | null>(null);

export function useNotifications(): NotificationsApi {
	const ctx = useContext(NotificationsContext);
	if (!ctx) {
		throw new Error("useNotifications must be used within <NotificationsProvider />");
	}
	return ctx;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
	const [items, setItems] = useState<NotificationItem[]>([]);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const close = useCallback((id: string) => {
		setItems((prev) => prev.filter((n) => n.id !== id));
	}, []);

	const push = useCallback(
		(type: NotificationType, options: NotificationOptions) => {
			const id = options.id ?? `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
			const durationMs = options.durationMs ?? 5000;
			const item: NotificationItem = {
				id,
				type,
				title: options.title,
				description: options.description,
				createdAtMs: Date.now(),
				durationMs,
			};
			setItems((prev) => [...prev, item]);
			if (durationMs > 0) {
				window.setTimeout(() => close(id), durationMs);
			}
			return id;
		},
		[close]
	);

	const api = useMemo<NotificationsApi>(
		() => ({
			success: (o) => push("success", o),
			error: (o) => push("error", o),
			close,
		}),
		[push, close]
	);

	const portal = mounted
		? createPortal(
				<div
					ref={containerRef}
					className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-md flex-col gap-3"
					aria-live="polite"
					aria-atomic="true"
				>
					{items.map((item) => (
						<Toast key={item.id} item={item} onClose={() => close(item.id)} />
					))}
				</div>,
				document.body
		  )
		: null;

	return (
		<NotificationsContext.Provider value={api}>
			{children}
			{portal}
		</NotificationsContext.Provider>
	);
}

function Toast({ item, onClose }: { item: NotificationItem; onClose: () => void }) {
	const isSuccess = item.type === "success";
	const bg = isSuccess ? "bg-green-50" : "bg-red-50";
	const border = isSuccess ? "border-green-200" : "border-red-200";
	const textStrong = isSuccess ? "text-green-900" : "text-red-900";
	const text = isSuccess ? "text-green-800" : "text-red-800";
	const iconColor = isSuccess ? "text-green-600" : "text-red-600";
	const closeColor = isSuccess ? "text-green-700 hover:text-green-900" : "text-red-700 hover:text-red-900";

	return (
		<div
			className={[
				"pointer-events-auto relative w-full overflow-hidden rounded-2xl border shadow-lg",
				bg,
				border,
				"transition-all duration-300 ease-out",
				"data-[enter=true]:animate-[toast-in_280ms_ease-out] data-[leave=true]:animate-[toast-out_200ms_ease-in]",
			].join(" ")}
			data-enter
			role="status"
			aria-live="polite"
		>
			<div className="flex items-start gap-4 p-5">
				<div className={["mt-0.5 h-6 w-6 shrink-0", iconColor].join(" ")}>
					{item.type === "success" ? <CheckCircleIcon className="h-6 w-6" /> : <ExclamationCircleIcon className="h-6 w-6" />}
				</div>
				<div className="flex min-w-0 flex-1 flex-col">
					<p className={["text-xl font-semibold leading-6", textStrong].join(" ")}>{item.title}</p>
					{item.description ? (
						<p className={["mt-1 text-sm leading-5", text].join(" ")}>{item.description}</p>
					) : null}
				</div>
				<button
					type="button"
					className={[
						"ml-2 inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
						closeColor,
						"focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white",
						isSuccess ? "focus:ring-green-600" : "focus:ring-red-600",
					].join(" ")}
					aria-label="Close notification"
					onClick={onClose}
				>
					<XIcon className="h-5 w-5" />
				</button>
			</div>
		</div>
	);
}

// DEMO/Standalone component for now, can be removed when integrated into canvas
export function NotificationsShowcase() {
	const { success, error } = useNotifications();
	const triggerError = () =>
		error({
			title: "Unable to Load Contents",
			description: "Could not load contents of [file-path]. Please load a different file.",
			// Keeping longer to read like the mock
			durationMs: 6500,
		});

	const triggerSuccess = () =>
		success({
			title: "Save was Successful",
			description: "[Project] has been saved.",
			durationMs: 5000,
		});

	return (
		<div className="flex flex-wrap items-center gap-3">
			<button
				onClick={triggerError}
				className="rounded-md bg-red-600 px-4 py-2 text-white shadow hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
			>
				Show Error Toast
			</button>
			<button
				onClick={triggerSuccess}
				className="rounded-md bg-green-600 px-4 py-2 text-white shadow hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
			>
				Show Success Toast
			</button>
		</div>
	);
}

// Convenience wrapper to mount provider around an island for quick testing
export function NotificationsRoot({ children }: { children: React.ReactNode }) {
	return <NotificationsProvider>{children}</NotificationsProvider>;
} 