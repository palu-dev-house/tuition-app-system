/**
 * Download a file from an API endpoint using fetch + blob.
 * This avoids the corruption caused by window.open() on binary responses.
 */
export async function downloadFileFromApi(
  url: string,
  filename: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
