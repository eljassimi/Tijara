type AccessSubject = {
  status: string;
  staffMembership?: {
    active: boolean;
    affiliateProfile: { user: { status: string } };
  } | null;
};

export function accountCanAccess(subject: AccessSubject) {
  if (subject.status !== "ACTIVE") return false;
  if (!subject.staffMembership) return true;
  return (
    subject.staffMembership.active &&
    subject.staffMembership.affiliateProfile.user.status === "ACTIVE"
  );
}
