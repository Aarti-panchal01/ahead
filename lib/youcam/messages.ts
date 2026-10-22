// Plain words for YouCam error codes: what happened, what to do next.
const MESSAGES: Record<string, string> = {
  error_no_face: "This photo needs a person wearing the wig or wrap. Mannequin and flat photos can't be tried on. Choose a photo with a model.",
  error_large_face_angle: "Your face is turned too far. Look straight at the camera and take the photo again.",
  error_face_pose: "Your face is turned too far. Look straight at the camera and take the photo again.",
  error_no_shoulder: "We need to see your shoulders. Hold the phone a little further away and try again.",
  error_insufficient_landmarks: "We couldn't see your face clearly. Try again in even light, facing the camera.",
  no_recording: "This demo combination isn't recorded yet. Pick another wig or face.",
  reserve: "Live try-on is paused to keep units for judging. The demo still works.",
};

export function messageFor(code?: string): string {
  return (code && MESSAGES[code]) || "The try-on didn't work this time. Try again, or pick another photo.";
}
