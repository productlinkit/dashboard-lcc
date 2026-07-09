import { useState } from "react";
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from "lucide-react";
import logoLcc from "../../imports/logo-lcc.png";

/* Demo credentials (no registration). */
const VALID_EMAIL = "admin@gmail.com";
const VALID_PASSWORD = "l1nk1t360";

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === VALID_EMAIL && password === VALID_PASSWORD) {
      setError("");
      onSuccess();
    } else {
      setError("Invalid email or password.");
    }
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #3752AE 0%, #253a86 100%)" }}
    >
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center mb-6">
          <img src={logoLcc} alt="LCC" className="h-14 w-14 object-contain rounded-2xl bg-white p-1.5 shadow-lg" />
          <h1 className="text-white text-xl font-semibold mt-3 tracking-wide">Lao Citizen Center</h1>
          <p className="text-white/60 text-sm">Sign in to continue to the admin console</p>
        </div>

        {/* Card */}
        <form onSubmit={submit} className="bg-white rounded-2xl shadow-xl p-7">
          <h2 className="text-lg font-semibold text-gray-800">Sign in</h2>
          <p className="text-sm text-gray-400 mt-0.5 mb-5">Enter your credentials to access the console.</p>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Email */}
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-4 focus-within:border-[#3752AE]">
            <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@gmail.com"
              autoComplete="email"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
          </div>

          {/* Password */}
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-6 focus-within:border-[#3752AE]">
            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="flex-1 bg-transparent outline-none text-sm text-gray-700 placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#3752AE] text-white hover:bg-[#2c428b] transition-all"
          >
            <LogIn className="w-4 h-4" /> Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
