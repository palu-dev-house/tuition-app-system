import type { GetServerSideProps } from "next";
import { verifyToken } from "@/lib/auth";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const authToken = req.cookies["auth-token"];
  const destination =
    authToken && (await verifyToken(authToken))
      ? "/admin/dashboard"
      : "/admin/login";

  return {
    redirect: { destination, permanent: false },
  };
};

export default function AdminIndexPage() {
  return null;
}
