import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
import AuthLayout from "@/components/auth/AuthLayout";

export const metadata = { title: "Choose Your Password — ConveyClear" };

// The forced-change gate. The middleware holds any account with
// users.must_change_password here (migration 031) — i.e. one that is still on
// the temporary password a staff member generated, saw on screen, and emailed.
export default function ChangePasswordPage() {
  return (
    <AuthLayout
      title="Choose your password"
      subtitle="You are signed in with a temporary password. Set your own to continue — it is not shared with anyone at ConveyClear."
    >
      <ChangePasswordForm forced />
    </AuthLayout>
  );
}
