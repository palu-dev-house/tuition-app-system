import type { GetServerSideProps } from "next";
import { verifyToken } from "@/lib/auth";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const studentToken = req.cookies["student-token"];
  const destination =
    studentToken && (await verifyToken(studentToken))
      ? "/portal"
      : "/portal/login";

  return {
    redirect: { destination, permanent: false },
  };
};

export default function HomePage() {
  return null;
}
