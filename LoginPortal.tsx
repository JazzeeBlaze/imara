// LoginPortal.tsx
// ─────────────────────────────────────────────────────────────
// Framer Code Component — Login Gate + File Browser Portal
// Repo: https://github.com/JazzeeBlaze/imara
//
// HOW TO USE IN FRAMER:
//   1. Assets panel → Code → + → New file → name it "LoginPortal"
//   2. Paste this entire file
//   3. Drag the component onto your page
//   4. Resize to fill (100% × 100%)
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react"
import { addPropertyControls, ControlType } from "framer"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  CONFIGURATION — edit these for your project
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GITHUB_OWNER = "JazzeeBlaze"
const GITHUB_REPO = "imara"
const GITHUB_BRANCH = "main"
const PORTAL_TITLE = "Project Portal"

// Fine-grained PAT – needed ONLY for activity logging (login/download tracking).
// Create one at: GitHub → Settings → Developer Settings → Fine-grained tokens
// Scope: this repo only · Permission: Contents → Read and Write
const GITHUB_PAT = ""

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  INTERNAL CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const RAW = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}`
const API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
interface IUser {
    username: string
    passwordHash: string
    displayName: string
}
interface IFileNode {
    name: string
    type: "file" | "folder"
    size?: number
    modified?: string
    children?: IFileNode[]
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UTILITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function sha256(msg: string): Promise<string> {
    const buf = new TextEncoder().encode(msg)
    const hash = await crypto.subtle.digest("SHA-256", buf)
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
}

function fmtSize(bytes?: number): string {
    if (bytes == null || bytes === 0) return "—"
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}

function fmtDate(str?: string): string {
    if (!str) return "—"
    try {
        return new Date(str).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        })
    } catch {
        return str
    }
}

function fileCount(node: IFileNode): number {
    if (node.type === "file") return 1
    return (node.children || []).reduce((n, c) => n + fileCount(c), 0)
}

function getExt(name: string): string {
    const i = name.lastIndexOf(".")
    return i > 0 ? name.slice(i + 1).toLowerCase() : ""
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ACTIVITY LOGGING (GitHub API)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function logActivity(entry: {
    username: string
    displayName: string
    action: string
    detail?: string
}): Promise<void> {
    if (!GITHUB_PAT) {
        console.info("[Imara] Activity logging disabled — no GITHUB_PAT set.")
        return
    }

    const record = { ...entry, timestamp: new Date().toISOString() }
    const headers: Record<string, string> = {
        Authorization: `Bearer ${GITHUB_PAT}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            // 1. Read current log
            let logs: { logs: any[] } = { logs: [] }
            let fileSha: string | undefined

            const getRes = await fetch(`${API}/contents/activity-log.json`, { headers })
            if (getRes.ok) {
                const data = await getRes.json()
                fileSha = data.sha
                const decoded = atob(data.content.replace(/\n/g, ""))
                logs = JSON.parse(decoded)
            }

            // 2. Append new entry
            logs.logs.push(record)

            // 3. Write back
            const payload: any = {
                message: `log: ${entry.action} by ${entry.username}${entry.detail ? " — " + entry.detail : ""}`,
                content: btoa(unescape(encodeURIComponent(JSON.stringify(logs, null, 2)))),
            }
            if (fileSha) payload.sha = fileSha

            const putRes = await fetch(`${API}/contents/activity-log.json`, {
                method: "PUT",
                headers,
                body: JSON.stringify(payload),
            })

            if (putRes.ok || putRes.status === 201) return // success

            // 409 = conflict (someone else wrote in between). Retry.
            if (putRes.status === 409) {
                await new Promise((r) => setTimeout(r, 500 + attempt * 500))
                continue
            }

            console.warn("[Imara] Log write failed:", putRes.status)
            return
        } catch (err) {
            console.warn("[Imara] Log error:", err)
            return
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ICONS (inline SVG)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FolderIcon() {
    return (
        <svg
            width="22"
            height="18"
            viewBox="0 0 22 18"
            fill="none"
            style={{ flexShrink: 0 }}
        >
            <path
                d="M20 3H11L9 1H2C0.9 1 0 1.9 0 3V15C0 16.1 0.9 17 2 17H20C21.1 17 22 16.1 22 15V5C22 3.9 21.1 3 20 3Z"
                fill="#FFC107"
            />
        </svg>
    )
}

function FileTypeIcon({ name }: { name: string }) {
    const e = getExt(name)
    const colorMap: Record<string, string> = {
        pdf: "#E53935",
        doc: "#1976D2",
        docx: "#1976D2",
        xls: "#388E3C",
        xlsx: "#388E3C",
        csv: "#388E3C",
        ppt: "#E65100",
        pptx: "#E65100",
        jpg: "#7B1FA2",
        jpeg: "#7B1FA2",
        png: "#7B1FA2",
        gif: "#7B1FA2",
        webp: "#7B1FA2",
        svg: "#7B1FA2",
        mp4: "#AD1457",
        mov: "#AD1457",
        avi: "#AD1457",
        mkv: "#AD1457",
        mp3: "#00838F",
        wav: "#00838F",
        zip: "#4E342E",
        rar: "#4E342E",
        "7z": "#4E342E",
        txt: "#546E7A",
        md: "#546E7A",
        dwg: "#0D47A1",
        dxf: "#0D47A1",
    }
    const c = colorMap[e] || "#78909C"
    const label = e ? e.toUpperCase().slice(0, 4) : "FILE"

    return (
        <div
            style={{
                width: 22,
                height: 26,
                borderRadius: "2px 6px 2px 2px",
                border: `1.5px solid ${c}`,
                background: `${c}15`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
            }}
        >
            <span
                style={{
                    fontSize: 7,
                    fontWeight: 800,
                    color: c,
                    letterSpacing: "0.02em",
                    lineHeight: 1,
                }}
            >
                {label}
            </span>
        </div>
    )
}

function DownloadArrow() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
                d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10"
                stroke="#0061D5"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

function SpinnerIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle
                cx="8"
                cy="8"
                r="6"
                stroke="#0061D5"
                strokeWidth="2"
                strokeDasharray="28"
                strokeDashoffset="8"
                strokeLinecap="round"
            >
                <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 8 8"
                    to="360 8 8"
                    dur="0.8s"
                    repeatCount="indefinite"
                />
            </circle>
        </svg>
    )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function LoginPortal(props: any) {
    // ── State ──
    const [view, setView] = useState<"login" | "files">("login")
    const [user, setUser] = useState<{
        username: string
        displayName: string
    } | null>(null)

    // Login form
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [busy, setBusy] = useState(false)
    const [focusField, setFocusField] = useState("")

    // File browser
    const [tree, setTree] = useState<IFileNode | null>(null)
    const [path, setPath] = useState<string[]>([])
    const [loadingFiles, setLoadingFiles] = useState(false)
    const [downloading, setDownloading] = useState<string | null>(null)

    // Logo fallback
    const [logoErr, setLogoErr] = useState(false)

    // ── Load file tree when entering browser ──
    useEffect(() => {
        if (view !== "files" || tree) return
        setLoadingFiles(true)
        fetch(`${RAW}/files.json`)
            .then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                return r.json()
            })
            .then(setTree)
            .catch((e) => console.error("[Imara] files.json error:", e))
            .finally(() => setLoadingFiles(false))
    }, [view, tree])

    // ── Login handler ──
    const doLogin = useCallback(async () => {
        const u = username.trim()
        const p = password
        if (!u || !p) {
            setError("Please enter both username and password")
            return
        }
        setError("")
        setBusy(true)
        try {
            const res = await fetch(`${RAW}/users.json`)
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data: { users: IUser[] } = await res.json()
            const hash = await sha256(p)
            const match = data.users.find(
                (usr) =>
                    usr.username.toLowerCase() === u.toLowerCase() &&
                    usr.passwordHash === hash
            )
            if (!match) {
                setError("Invalid username or password")
                setBusy(false)
                return
            }
            const loggedIn = {
                username: match.username,
                displayName: match.displayName,
            }
            setUser(loggedIn)
            setView("files")
            // Fire-and-forget log
            logActivity({ ...loggedIn, action: "login" })
        } catch (err) {
            setError("Unable to connect. Please try again.")
        } finally {
            setBusy(false)
        }
    }, [username, password])

    // ── Get current folder items ──
    const currentItems = useCallback((): IFileNode[] => {
        if (!tree) return []
        let node = tree
        for (const seg of path) {
            const child = node.children?.find(
                (c) => c.name === seg && c.type === "folder"
            )
            if (!child) return []
            node = child
        }
        // Sort: folders first, then alphabetical
        return [...(node.children || [])].sort((a, b) => {
            if (a.type !== b.type) return a.type === "folder" ? -1 : 1
            return a.name.localeCompare(b.name)
        })
    }, [tree, path])

    // ── Download handler ──
    const doDownload = useCallback(
        async (relPath: string, fileName: string) => {
            setDownloading(fileName)
            try {
                const url = `${RAW}/Storage/${encodeURIComponent(relPath).replace(/%2F/g, "/")}`
                const res = await fetch(url)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const blob = await res.blob()
                const blobUrl = URL.createObjectURL(blob)
                const a = document.createElement("a")
                a.href = blobUrl
                a.download = fileName
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(blobUrl)

                // Log download
                if (user) {
                    logActivity({
                        ...user,
                        action: "download",
                        detail: relPath,
                    })
                }
            } catch (err) {
                console.error("[Imara] Download failed:", err)
                alert("Download failed. Please try again.")
            } finally {
                setDownloading(null)
            }
        },
        [user]
    )

    // ── Logout ──
    const doLogout = useCallback(() => {
        setView("login")
        setUser(null)
        setUsername("")
        setPassword("")
        setPath([])
        setTree(null)
        setError("")
        setLogoErr(false)
    }, [])

    // ── Key handler (Enter to login) ──
    const onKey = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") doLogin()
        },
        [doLogin]
    )

    // ── Hover helpers ──
    const onRowEnter = (e: React.MouseEvent<HTMLTableRowElement>) => {
        e.currentTarget.style.background = "#F5F7FA"
    }
    const onRowLeave = (e: React.MouseEvent<HTMLTableRowElement>) => {
        e.currentTarget.style.background = ""
    }
    const onBtnEnter = (
        e: React.MouseEvent<HTMLButtonElement>,
        bg: string
    ) => {
        e.currentTarget.style.background = bg
    }
    const onBtnLeave = (
        e: React.MouseEvent<HTMLButtonElement>,
        bg: string
    ) => {
        e.currentTarget.style.background = bg
    }

    // ── Logo element (shared between screens) ──
    const LogoImg = ({ maxH = 40, maxW = 180 }: { maxH?: number; maxW?: number }) =>
        logoErr ? (
            <span style={{ color: "#bbb", fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>
                YOUR LOGO
            </span>
        ) : (
            <img
                src={`${RAW}/assets/logo.png`}
                alt="Logo"
                style={{
                    maxHeight: maxH,
                    maxWidth: maxW,
                    objectFit: "contain" as const,
                }}
                onError={() => setLogoErr(true)}
            />
        )

    // ═════════════════════════════════════════════════════════
    //  LOGIN SCREEN
    // ═════════════════════════════════════════════════════════
    if (view === "login") {
        return (
            <div style={S.loginBg}>
                <div style={S.card}>
                    {/* Logo */}
                    <div style={S.logoBox}>
                        <LogoImg />
                    </div>

                    <h2 style={S.h2}>Sign In</h2>
                    <p style={S.subtitle}>
                        Enter the credentials provided by your administrator
                    </p>

                    {/* Username */}
                    <div style={S.field}>
                        <label style={S.label}>Username</label>
                        <input
                            style={{
                                ...S.input,
                                borderColor:
                                    focusField === "user"
                                        ? "#0061D5"
                                        : "#d0d5dd",
                                boxShadow:
                                    focusField === "user"
                                        ? "0 0 0 3px rgba(0,97,213,0.12)"
                                        : "none",
                            }}
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onKeyDown={onKey}
                            onFocus={() => setFocusField("user")}
                            onBlur={() => setFocusField("")}
                            placeholder="Enter your username"
                            autoComplete="username"
                        />
                    </div>

                    {/* Password */}
                    <div style={S.field}>
                        <label style={S.label}>Password</label>
                        <input
                            style={{
                                ...S.input,
                                borderColor:
                                    focusField === "pass"
                                        ? "#0061D5"
                                        : "#d0d5dd",
                                boxShadow:
                                    focusField === "pass"
                                        ? "0 0 0 3px rgba(0,97,213,0.12)"
                                        : "none",
                            }}
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={onKey}
                            onFocus={() => setFocusField("pass")}
                            onBlur={() => setFocusField("")}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                        />
                    </div>

                    {/* Sign In button */}
                    <button
                        style={{
                            ...S.loginBtn,
                            opacity: busy ? 0.7 : 1,
                            cursor: busy ? "wait" : "pointer",
                        }}
                        onClick={doLogin}
                        disabled={busy}
                        onMouseEnter={(e) =>
                            !busy && onBtnEnter(e, "#0050B3")
                        }
                        onMouseLeave={(e) =>
                            !busy && onBtnLeave(e, "#0061D5")
                        }
                    >
                        {busy ? "Signing in…" : "Sign In"}
                    </button>

                    {/* Error */}
                    {error && <p style={S.err}>{error}</p>}
                </div>

                {/* Footer */}
                <p style={S.loginFooter}>
                    Contact your administrator for access
                </p>
            </div>
        )
    }

    // ═════════════════════════════════════════════════════════
    //  FILE BROWSER SCREEN
    // ═════════════════════════════════════════════════════════
    const items = currentItems()
    const pathStr = path.join("/")

    return (
        <div style={S.browser}>
            {/* ── Header ── */}
            <header style={S.header}>
                <div style={S.hLogoWrap}>
                    <LogoImg maxH={28} maxW={120} />
                </div>
                <div style={S.hRight}>
                    <span style={S.hUser}>{user?.displayName}</span>
                    <button
                        style={S.hLogout}
                        onClick={doLogout}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = "#E53935"
                            e.currentTarget.style.color = "#fff"
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent"
                            e.currentTarget.style.color = "#E53935"
                        }}
                    >
                        Log out
                    </button>
                </div>
            </header>

            {/* ── Title bar ── */}
            <div style={S.titleBar}>
                <h1 style={S.title}>{PORTAL_TITLE}</h1>
            </div>

            {/* ── Breadcrumbs ── */}
            <nav style={S.crumbs}>
                <button
                    style={{
                        ...S.crumb,
                        fontWeight: path.length === 0 ? 600 : 500,
                    }}
                    onClick={() => setPath([])}
                >
                    Home
                </button>
                {path.map((seg, i) => (
                    <React.Fragment key={i}>
                        <span style={S.crumbSep}>›</span>
                        <button
                            style={{
                                ...S.crumb,
                                fontWeight:
                                    i === path.length - 1 ? 600 : 500,
                                color:
                                    i === path.length - 1
                                        ? "#333"
                                        : "#0061D5",
                            }}
                            onClick={() => setPath(path.slice(0, i + 1))}
                        >
                            {seg}
                        </button>
                    </React.Fragment>
                ))}
            </nav>

            {/* ── File table ── */}
            <div style={S.tableArea}>
                {loadingFiles ? (
                    <div style={S.emptyState}>
                        <SpinnerIcon />
                        <p style={{ marginTop: 12, color: "#888" }}>
                            Loading files…
                        </p>
                    </div>
                ) : items.length === 0 ? (
                    <div style={S.emptyState}>
                        <p style={{ color: "#999", fontSize: 15 }}>
                            {tree
                                ? "This folder is empty"
                                : "No files available yet"}
                        </p>
                    </div>
                ) : (
                    <table style={S.table}>
                        <thead>
                            <tr>
                                <th style={S.th}>Name</th>
                                <th style={{ ...S.th, width: 180 }}>
                                    Modified
                                </th>
                                <th style={{ ...S.th, width: 110 }}>
                                    Size
                                </th>
                                <th style={{ ...S.th, width: 50 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => {
                                const rel = pathStr
                                    ? `${pathStr}/${item.name}`
                                    : item.name
                                const isDl = downloading === item.name

                                return (
                                    <tr
                                        key={item.name}
                                        style={S.row}
                                        onClick={() =>
                                            item.type === "folder" &&
                                            setPath([...path, item.name])
                                        }
                                        onMouseEnter={onRowEnter}
                                        onMouseLeave={onRowLeave}
                                    >
                                        {/* Name */}
                                        <td style={S.td}>
                                            <div style={S.nameCell}>
                                                {item.type === "folder" ? (
                                                    <FolderIcon />
                                                ) : (
                                                    <FileTypeIcon
                                                        name={item.name}
                                                    />
                                                )}
                                                <span
                                                    style={{
                                                        marginLeft: 10,
                                                        fontWeight:
                                                            item.type ===
                                                            "folder"
                                                                ? 500
                                                                : 400,
                                                        color:
                                                            item.type ===
                                                            "folder"
                                                                ? "#1a1a1a"
                                                                : "#333",
                                                    }}
                                                >
                                                    {item.name}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Modified */}
                                        <td
                                            style={{
                                                ...S.td,
                                                color: "#888",
                                                fontSize: 13,
                                            }}
                                        >
                                            {fmtDate(item.modified)}
                                        </td>

                                        {/* Size */}
                                        <td
                                            style={{
                                                ...S.td,
                                                color: "#888",
                                                fontSize: 13,
                                            }}
                                        >
                                            {item.type === "folder"
                                                ? `${fileCount(item)} File${fileCount(item) !== 1 ? "s" : ""}`
                                                : fmtSize(item.size)}
                                        </td>

                                        {/* Download button */}
                                        <td style={S.td}>
                                            {item.type === "file" && (
                                                <button
                                                    style={S.dlBtn}
                                                    title={
                                                        isDl
                                                            ? "Downloading…"
                                                            : `Download ${item.name}`
                                                    }
                                                    disabled={isDl}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        doDownload(
                                                            rel,
                                                            item.name
                                                        )
                                                    }}
                                                >
                                                    {isDl ? (
                                                        <SpinnerIcon />
                                                    ) : (
                                                        <DownloadArrow />
                                                    )}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

// ── Property controls (optional config from Framer canvas) ──
addPropertyControls(LoginPortal, {
    portalTitle: {
        type: ControlType.String,
        title: "Portal Title",
        defaultValue: "Project Portal",
    },
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  STYLES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FONT =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

const S: Record<string, React.CSSProperties> = {
    // ── Login page ──────────────────────────────────────────
    loginBg: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #f0f2f5 0%, #e8ecf1 100%)",
        fontFamily: FONT,
        padding: 20,
        boxSizing: "border-box",
    },
    card: {
        width: "100%",
        maxWidth: 400,
        background: "#fff",
        borderRadius: 14,
        padding: "40px 32px 32px",
        boxShadow:
            "0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
    },
    logoBox: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 24,
        minHeight: 40,
    },
    h2: {
        textAlign: "center",
        fontSize: 22,
        fontWeight: 600,
        color: "#1a1a1a",
        margin: "0 0 6px",
    },
    subtitle: {
        textAlign: "center",
        fontSize: 13,
        color: "#888",
        margin: "0 0 24px",
        fontWeight: 400,
    },
    field: {
        marginBottom: 16,
    },
    label: {
        display: "block",
        fontSize: 13,
        fontWeight: 500,
        color: "#444",
        marginBottom: 6,
    },
    input: {
        width: "100%",
        padding: "10px 14px",
        border: "1px solid #d0d5dd",
        borderRadius: 8,
        fontSize: 15,
        color: "#1a1a1a",
        outline: "none",
        boxSizing: "border-box",
        fontFamily: FONT,
        transition: "border-color 0.15s, box-shadow 0.15s",
    },
    loginBtn: {
        width: "100%",
        padding: "12px",
        background: "#0061D5",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        fontSize: 15,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 8,
        fontFamily: FONT,
        transition: "background 0.15s, opacity 0.15s",
    },
    err: {
        color: "#E53935",
        fontSize: 13,
        textAlign: "center",
        marginTop: 14,
        marginBottom: 0,
        fontWeight: 500,
    },
    loginFooter: {
        marginTop: 24,
        fontSize: 12,
        color: "#aaa",
    },

    // ── File browser ────────────────────────────────────────
    browser: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        fontFamily: FONT,
        overflow: "hidden",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 24px",
        borderBottom: "1px solid #e8e8e8",
        minHeight: 52,
        flexShrink: 0,
    },
    hLogoWrap: {
        display: "flex",
        alignItems: "center",
    },
    hRight: {
        display: "flex",
        alignItems: "center",
        gap: 14,
    },
    hUser: {
        fontSize: 14,
        color: "#555",
        fontWeight: 500,
    },
    hLogout: {
        padding: "5px 14px",
        background: "transparent",
        color: "#E53935",
        border: "1px solid #E53935",
        borderRadius: 6,
        fontSize: 13,
        cursor: "pointer",
        fontWeight: 500,
        fontFamily: FONT,
        transition: "background 0.15s, color 0.15s",
    },
    titleBar: {
        padding: "18px 24px 6px",
        flexShrink: 0,
    },
    title: {
        fontSize: 20,
        fontWeight: 600,
        color: "#1a1a1a",
        margin: 0,
    },
    crumbs: {
        padding: "6px 24px 12px",
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
        fontSize: 13,
        color: "#888",
        flexShrink: 0,
    },
    crumb: {
        background: "none",
        border: "none",
        padding: "2px 4px",
        color: "#0061D5",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        fontFamily: FONT,
    },
    crumbSep: {
        color: "#ccc",
        margin: "0 2px",
        fontSize: 14,
        userSelect: "none",
    },
    tableArea: {
        flex: 1,
        overflowY: "auto",
        padding: "0 24px 24px",
    },
    table: {
        width: "100%",
        borderCollapse: "collapse",
    },
    th: {
        textAlign: "left",
        padding: "10px 12px",
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        color: "#999",
        letterSpacing: "0.05em",
        borderBottom: "2px solid #e8e8e8",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 1,
    },
    row: {
        cursor: "pointer",
        transition: "background 0.1s",
    },
    td: {
        padding: "10px 12px",
        fontSize: 14,
        color: "#333",
        borderBottom: "1px solid #f0f0f0",
        verticalAlign: "middle",
    },
    nameCell: {
        display: "flex",
        alignItems: "center",
    },
    dlBtn: {
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 4,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 0.15s",
    },
    emptyState: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 20px",
    },
}
