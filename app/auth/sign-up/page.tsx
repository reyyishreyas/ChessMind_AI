import { redirect } from "next/navigation"

// Offline mode: no auth server. Any auth route bounces straight back to the game.
export default function AuthSignUpPage() {
  redirect("/")
}