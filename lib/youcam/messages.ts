// Plain words for YouCam and platform error codes: what happened, what to do next.
// Codes come from docs.perfectcorp.com/develop/error_codes, the hair-transfer docs and docs/api-truth-table.md.
const FACE_TURNED = "Your face is turned too far. Look straight at the camera and take the photo again.";
const NO_ONE_WEARING = "This photo has no one wearing the wig, so we can't preview it";

const MESSAGES: Record<string, string> = {
  // YouCam: general
  exceed_max_filesize: "That photo is too large. Use one under 10 MB.",
  invalid_parameter: "Something about that request wasn't valid. Try again, or pick another photo.",
  error_download_image: "We couldn't load that photo. Try another one.",
  error_download_mask: "We couldn't load that photo. Try another one.",
  error_decode_image: "We couldn't read that photo. Use a JPG, PNG or WebP photo.",
  error_decode_mask: "We couldn't read that photo. Use a JPG, PNG or WebP photo.",
  error_download_video: "We couldn't load that file. Try another photo.",
  error_decode_video: "We couldn't read that file. Try another photo.",
  error_nsfw_content_detected: "We can't use that photo. Choose a different one.",
  exceed_nsfw_retry_limits: "We can't make a preview from that photo. Choose a different one.",
  error_no_face: "This photo needs a person wearing the wig or wrap. Mannequin and flat photos can't be tried on. Choose a photo with a model. If it was your own photo, make sure your whole face is clearly visible.",
  error_pose: "We couldn't see your head and shoulders clearly. Stand back a little and face the camera.",
  error_face_parsing: "We couldn't make out your face clearly. Try again in even light, facing the camera.",
  error_inference: "The preview didn't finish this time. Try again in a moment.",
  error_upload: "The preview was made but we couldn't save it. Try again in a moment.",
  error_multiple_people: "We can only preview one person at a time. Use a photo with just you in it.",
  error_no_shoulder: "We need to see your shoulders. Hold the phone a little further away and try again.",
  error_large_face_angle: FACE_TURNED,
  error_face_angle_invalid: FACE_TURNED,
  error_face_pose: FACE_TURNED,
  error_insufficient_landmarks: "We couldn't see your face clearly. Try again in even light, facing the camera.",
  error_hair_too_short: "The hair in this photo is too short for this preview. Try another photo.",
  error_bald_image: "The hairstyle photo shows no hair. Choose a photo of a person wearing the wig.",
  error_unexpected_video_duration: "That file isn't the right length. Try another photo.",
  error_unsupport_ratio: "That photo is a shape we can't use. Use a regular portrait or square photo.",
  unknown_internal_error: "Something went wrong on our side. Try again in a moment. You weren't charged.",
  unknown_error: "The try-on didn't work this time. Try again, or pick another photo.",

  // Platform
  no_recording: "This demo combination isn't recorded yet. Pick another wig or face.",
  unknown_item: "We don't know that wig or wrap. Pick one from the list.",
  no_photo: "Add a photo of yourself first, or choose a demo face.",
  unknown_task: "We couldn't find that try-on. Start it again.",
  reserve: "Live try-on is paused to keep units for judging. The demo still works.",
  daily_cap: "Live try-ons are paused for today. You can still try our sample people, or come back tomorrow.",
  rate_limit: "You've reached the hourly limit for live try-ons. Try again a bit later.",
  unavailable: "Live try-on is resting right now. You can still try our sample people, or try again later.",
  missing_key: "Live try-on isn't set up on this server.",
  upload_failed: "We couldn't upload the photo. Try again in a moment.",
  create_failed: "The try-on couldn't start. Try again.",
  not_image: "That file isn't a photo we can read. Use a JPG, PNG or WebP photo.",
  too_large: "That photo is too large. Use one under 10 MB.",
  too_small: "That photo is too small. Use one at least 256 pixels on its longest side.",
  empty_upload: "The upload was empty. Choose the photo again.",
  bad_url: "That link isn't a web address we can use. Paste a link that starts with https://.",
  blocked_url: "We can't open that link. Paste a link to a public photo.",
  not_an_image_url: "That link doesn't lead to a photo. Paste a link to the listing photo itself, or upload it.",
  fetch_failed: "We couldn't load a photo from that link. Try uploading the photo instead.",
  needs_live: "Listing previews need live mode. The live preview is switched off in this demo, so you're seeing a recorded example.",
  tester_code: "Live try-on on your own photo needs a tester code. You can still try our sample people and match wigs to your hair colour.",
  tester_rate_limit: "Too many code attempts. Try again in an hour.",
  brief_not_found: "This brief has expired or the link is wrong.",
  bad_brief: "That brief couldn't be saved. Check the items and colours and try again.",
  brief_rate_limit: "You've made several briefs this hour. Try again a bit later.",
  result_unavailable: "We couldn't load that render. Start the try-on again.",
  no_listing: "Add a listing photo or paste a link to one.",
};

export type MessageContext = "listing";

export function messageFor(code?: string, context?: MessageContext): string {
  if (context === "listing" && code === "error_no_face") return `${NO_ONE_WEARING}. Choose a listing photo that shows a person wearing it.`;
  return (code && MESSAGES[code]) || "The try-on didn't work this time. Try again, or pick another photo.";
}
export { NO_ONE_WEARING };
