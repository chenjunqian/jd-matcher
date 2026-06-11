import type { UserMatchedDetailJob } from "../types.js";

const DO_NOT_REPLY_HTML = '<hr style="margin-top:24px"><p style="color:#999;font-size:11px">This is an automated message from JD Matcher. Please do not reply to this email.</p>';
const DO_NOT_REPLY_TEXT = "\n\n---\nThis is an automated message from JD Matcher. Please do not reply to this email.";

export function buildVerificationEmailHtml(link: string): string {
  return `<p>Please click the link below to verify your email address:</p>
<p><a href="${link}">${link}</a></p>
<p>This link expires in 24 hours.</p>
<p>If you did not request this, please ignore this email.</p>${DO_NOT_REPLY_HTML}`;
}

export function buildVerificationEmailText(link: string): string {
  return `Please click the link below to verify your email address:\n\n${link}\n\nThis link expires in 24 hours.\n\nIf you did not request this, please ignore this email.${DO_NOT_REPLY_TEXT}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildJobNotificationHtml(jobs: UserMatchedDetailJob[]): string {
  let html = "<h2>New Job Matches</h2><p>You have new matched jobs, please check.</p>";
  for (const j of jobs) {
    html += `<div style="margin-bottom:16px;padding:12px;border:1px solid #ddd;border-radius:8px;">
<h3 style="margin:0 0 4px">${escapeHtml(j.title)}</h3>
<p style="margin:2px 0"><strong>Location:</strong> ${escapeHtml(j.location)}</p>
<p style="margin:2px 0"><strong>Salary:</strong> ${escapeHtml(j.salary)}</p>
<p style="margin:2px 0"><strong>Score:</strong> ${escapeHtml(j.matchScore)}</p>
<p style="margin:2px 0"><strong>Reason:</strong> ${escapeHtml(j.matchReason)}</p>
<p style="margin:2px 0"><strong>Date:</strong> ${(j.updateTime ?? "").split("T")[0]}</p>
<p><a href="${escapeHtml(j.link)}">View Job</a></p>
</div>`;
  }
  html += '<hr style="margin-top:24px"><p style="color:#999;font-size:11px">This is an automated message from JD Matcher. Please do not reply to this email.</p>';
  return html;
}

export function buildJobNotificationText(jobs: UserMatchedDetailJob[]): string {
  let msg = "You have new matched jobs, please check.\n\n";
  for (const j of jobs) {
    msg += `Title : ${j.title}\nLink : ${j.link}\nLocation : ${j.location}\nSalary : ${j.salary}\nMatch Score : ${j.matchScore}\nMatch Reason : ${j.matchReason}\nDate : ${(j.updateTime ?? "").split("T")[0]}\n\n`;
  }
  msg += "\n---\nThis is an automated message from JD Matcher. Please do not reply to this email.";
  return msg;
}
