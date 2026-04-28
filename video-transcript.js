// Video transcript extraction helpers for supported video pages.

/**
 * Extract a balanced JSON object that appears after a JavaScript marker.
 * @param {string} source Script text that may contain serialized page state.
 * @param {string} marker Text that appears immediately before the JSON object.
 * @returns {object|null} Parsed JSON object, or null when not found.
 */
function extractJsonObjectAfterMarker(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return null;

  const startIndex = source.indexOf('{', markerIndex + marker.length);
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{') depth++;
    if (char === '}') depth--;

    if (depth === 0) {
      try {
        return JSON.parse(source.slice(startIndex, i + 1));
      } catch (error) {
        console.warn('[Page Copilot] Failed to parse page JSON:', error);
        return null;
      }
    }
  }

  return null;
}

/**
 * Read a serialized page-state object from inline scripts.
 * @param {string[]} markers Markers that may precede the serialized object.
 * @returns {object|null} Parsed object from the first matching marker.
 */
function readInlineJsonObject(markers) {
  const scripts = Array.from(document.scripts);

  for (const script of scripts) {
    const text = script.textContent || '';
    for (const marker of markers) {
      const result = extractJsonObjectAfterMarker(text, marker);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Normalize a subtitle URL that may be protocol-relative or relative.
 * @param {string} rawUrl Raw URL from a video platform response.
 * @returns {string} Absolute URL.
 */
function normalizeSubtitleUrl(rawUrl) {
  if (rawUrl.startsWith('//')) return `${location.protocol}${rawUrl}`;
  return new URL(rawUrl, location.href).toString();
}

/**
 * Fetch text from the page context, falling back to the extension background
 * worker when the page is blocked by cross-origin restrictions.
 * @param {string} url Resource URL.
 * @returns {Promise<{body: string, contentType: string, status: number}>} Text response.
 */
async function fetchTextWithBackgroundFallback(url) {
  try {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      body: await response.text(),
      contentType: response.headers.get('content-type') || '',
      status: response.status
    };
  } catch (fetchError) {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      throw fetchError;
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchTextResource', url }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (!response?.success) {
          reject(new Error(response?.error || fetchError.message));
          return;
        }

        resolve({
          body: response.body,
          contentType: response.contentType || '',
          status: response.status || 200
        });
      });
    });
  }
}

/**
 * Create a safe filename segment from page or subtitle metadata.
 * @param {string} value Raw filename segment.
 * @returns {string} Sanitized filename segment.
 */
function sanitizeFileName(value) {
  return (value || 'transcript')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'transcript';
}

/**
 * Format milliseconds as a WebVTT timestamp.
 * @param {number} milliseconds Time offset in milliseconds.
 * @returns {string} WebVTT timestamp.
 */
function formatVttTimestamp(milliseconds) {
  const safeMilliseconds = Math.max(0, Math.floor(Number(milliseconds) || 0));
  const hours = Math.floor(safeMilliseconds / 3600000);
  const minutes = Math.floor((safeMilliseconds % 3600000) / 60000);
  const seconds = Math.floor((safeMilliseconds % 60000) / 1000);
  const millis = safeMilliseconds % 1000;

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    `${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
  ].join(':');
}

/**
 * Escape subtitle cue text for safe WebVTT output.
 * @param {string} value Raw subtitle text.
 * @returns {string} Escaped cue text.
 */
function escapeVttCueText(value) {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a WebVTT document from timed subtitle cues.
 * @param {{startMs: number, endMs: number, text: string}[]} cues Timed subtitle cues.
 * @returns {string} WebVTT document.
 */
function buildWebVtt(cues) {
  const body = cues
    .filter((cue) => cue.text && cue.endMs > cue.startMs)
    .map((cue, index) => [
      String(index + 1),
      `${formatVttTimestamp(cue.startMs)} --> ${formatVttTimestamp(cue.endMs)}`,
      escapeVttCueText(cue.text)
    ].join('\n'))
    .join('\n\n');

  return `WEBVTT\n\n${body}\n`;
}

/**
 * Build download metadata for readable subtitle output.
 * @param {object} options Download metadata options.
 * @param {string} options.platform Source platform label.
 * @param {string} options.title Current page title.
 * @param {string} options.language Subtitle language code.
 * @param {string} options.body Readable subtitle body.
 * @returns {object} Download metadata for the side panel.
 */
function buildTranscriptDownload({ platform, title, language, body }) {
  const languageSuffix = language ? `-${sanitizeFileName(language)}` : '';
  const baseName = sanitizeFileName(`${title || platform || 'video'}${languageSuffix}`);

  return {
    body,
    format: 'vtt',
    mimeType: 'text/vtt;charset=utf-8',
    fileName: `${baseName}.vtt`
  };
}

/**
 * Convert YouTube JSON3 caption events into timed subtitle cues.
 * @param {object} data YouTube timedtext JSON3 payload.
 * @returns {{startMs: number, endMs: number, text: string}[]} Timed subtitle cues.
 */
function parseYouTubeJsonCues(data) {
  return (data.events || []).map((event) => {
    const text = (event.segs || [])
      .map((segment) => segment.utf8 || '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    const startMs = Number(event.tStartMs) || 0;
    const durationMs = Number(event.dDurationMs) || 0;

    return {
      startMs,
      endMs: startMs + Math.max(durationMs, 1),
      text
    };
  }).filter((cue) => cue.text);
}

/**
 * Convert YouTube JSON3 caption events into readable transcript text.
 * @param {object} data YouTube timedtext JSON3 payload.
 * @returns {string} Transcript text.
 */
function parseYouTubeJsonTranscript(data) {
  return parseYouTubeJsonCues(data)
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert XML caption text into timed subtitle cues.
 * @param {string} xmlText YouTube XML timedtext payload.
 * @returns {{startMs: number, endMs: number, text: string}[]} Timed subtitle cues.
 */
function parseYouTubeXmlCues(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  return Array.from(doc.querySelectorAll('text')).map((node) => {
    const startMs = Math.round((Number(node.getAttribute('start')) || 0) * 1000);
    const durationMs = Math.round((Number(node.getAttribute('dur')) || 0) * 1000);

    return {
      startMs,
      endMs: startMs + Math.max(durationMs, 1),
      text: (node.textContent || '').replace(/\s+/g, ' ').trim()
    };
  }).filter((cue) => cue.text);
}

/**
 * Convert XML caption text into readable transcript text.
 * @param {string} xmlText YouTube XML timedtext payload.
 * @returns {string} Transcript text.
 */
function parseYouTubeXmlTranscript(xmlText) {
  return parseYouTubeXmlCues(xmlText)
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract plain text from YouTube renderer runs.
 * @param {object|null} textRenderer YouTube text renderer object.
 * @returns {string} Combined text.
 */
function readYouTubeRendererText(textRenderer) {
  if (!textRenderer) return '';
  if (textRenderer.simpleText) return textRenderer.simpleText;
  return (textRenderer.runs || [])
    .map((run) => run.text || '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Read the transcript segment list embedded in YouTube's transcript panel.
 * Some videos expose a transcript panel while their timedtext URL returns an
 * empty body, so this is a necessary fallback after caption track fetching.
 * @param {object} initialData YouTube initial data object.
 * @returns {object[]} Raw transcript segment entries.
 */
function getYouTubeTranscriptPanelSegments(initialData) {
  const panels = initialData?.engagementPanels || [];
  const transcriptPanel = panels.find((panel) => {
    const section = panel?.engagementPanelSectionListRenderer;
    return section?.panelIdentifier === 'engagement-panel-searchable-transcript'
      || section?.targetId === 'engagement-panel-searchable-transcript'
      || section?.content?.transcriptRenderer;
  });

  return transcriptPanel
    ?.engagementPanelSectionListRenderer
    ?.content
    ?.transcriptRenderer
    ?.content
    ?.transcriptSearchPanelRenderer
    ?.body
    ?.transcriptSegmentListRenderer
    ?.initialSegments || [];
}

/**
 * Convert YouTube transcript panel segments into timed subtitle cues.
 * @param {object} initialData YouTube initial data object.
 * @returns {{startMs: number, endMs: number, text: string}[]} Timed subtitle cues.
 */
function parseYouTubeTranscriptPanelCues(initialData) {
  return getYouTubeTranscriptPanelSegments(initialData).map((item) => {
    const segment = item.transcriptSegmentRenderer;
    if (!segment) return null;

    const startMs = Number(segment.startMs) || 0;
    const endMs = Number(segment.endMs) || startMs + 1;
    const text = readYouTubeRendererText(segment.snippet);

    return {
      startMs,
      endMs: endMs > startMs ? endMs : startMs + 1,
      text
    };
  }).filter((cue) => cue?.text);
}

/**
 * Pick a useful caption track from a YouTube player response.
 * @param {object} playerResponse YouTube initial player response.
 * @returns {object|null} Caption track metadata.
 */
function selectYouTubeCaptionTrack(playerResponse) {
  const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (!tracks.length) return null;

  const preferredLanguage = (navigator.language || '').split('-')[0];
  return tracks.find((track) => track.languageCode === preferredLanguage && track.kind !== 'asr')
    || tracks.find((track) => track.languageCode === preferredLanguage)
    || tracks.find((track) => track.languageCode === 'en' && track.kind !== 'asr')
    || tracks.find((track) => track.languageCode === 'en')
    || tracks[0];
}

/**
 * Build a structured YouTube transcript diagnostic response.
 * @param {string} reason Machine-readable failure category.
 * @param {object} details Safe diagnostic details.
 * @returns {object} Diagnostic response.
 */
function buildYouTubeTranscriptDiagnostic(reason, details = {}) {
  return {
    transcriptUnavailable: true,
    platform: 'YouTube',
    reason,
    details
  };
}

/**
 * Read the current page's YouTube InnerTube API key.
 * @returns {string} API key embedded in the YouTube page.
 */
function getYouTubeInnertubeApiKey() {
  return document.documentElement.innerHTML.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1] || '';
}

/**
 * Read the current YouTube video ID from the page URL.
 * @returns {string} YouTube video ID.
 */
function getYouTubeVideoId() {
  return new URL(location.href).searchParams.get('v') || '';
}

/**
 * Fetch a YouTube Android player response. Some web caption URLs return empty
 * bodies while the Android player response still exposes usable caption URLs.
 * @param {string} videoId Current YouTube video ID.
 * @returns {Promise<object|null>} Android player response, or null when unavailable.
 */
async function fetchYouTubeAndroidPlayerResponse(videoId) {
  const apiKey = getYouTubeInnertubeApiKey();
  if (!videoId || !apiKey) return null;

  const client = {
    clientName: 'ANDROID',
    clientVersion: '20.10.38',
    androidSdkVersion: 30,
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    osName: 'Android',
    osVersion: '11'
  };

  try {
    const response = await fetch(`/youtubei/v1/player?key=${encodeURIComponent(apiKey)}&prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': '3',
        'X-YouTube-Client-Version': client.clientVersion
      },
      body: JSON.stringify({
        videoId,
        context: { client }
      })
    });

    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.warn('[Page Copilot] Failed to fetch YouTube Android player response:', error);
    return null;
  }
}

/**
 * Fetch readable text and download metadata from a YouTube caption track.
 * @param {object} track YouTube caption track metadata.
 * @returns {Promise<{payload: object|null, diagnostic: object|null}>} Transcript payload and diagnostics.
 */
async function fetchYouTubeCaptionPayload(track) {
  if (!track?.baseUrl) {
    return {
      payload: null,
      diagnostic: buildYouTubeTranscriptDiagnostic('caption url empty', {
        language: track?.languageCode || '',
        hasTrack: !!track
      })
    };
  }

  const captionUrl = new URL(track.baseUrl);
  captionUrl.searchParams.set('fmt', 'json3');
  const failures = [];
  const parseFailures = [];
  let sawCaptionBody = false;

  try {
    const response = await fetchTextWithBackgroundFallback(captionUrl.toString());
    const body = response.body || '';
    if (body.trim()) {
      sawCaptionBody = true;
      try {
        const data = JSON.parse(body);
        const text = parseYouTubeJsonTranscript(data);
        const cues = parseYouTubeJsonCues(data);
        if (text) {
          return {
            payload: {
              text,
              download: buildTranscriptDownload({
                platform: 'YouTube',
                title: document.title,
                language: track.languageCode || '',
                body: buildWebVtt(cues)
              })
            },
            diagnostic: null
          };
        }
        parseFailures.push('json3 parsed without readable text');
      } catch (error) {
        console.warn('[Page Copilot] Failed to parse YouTube JSON captions:', error);
        parseFailures.push(`json3 parse failed: ${error.message}`);
      }
    } else {
      parseFailures.push('json3 response was empty');
    }
  } catch (error) {
    console.warn('[Page Copilot] Failed to fetch YouTube JSON captions:', error);
    failures.push(`json3 fetch failed: ${error.message}`);
  }

  captionUrl.searchParams.delete('fmt');
  let xmlText = '';
  try {
    const xmlResponse = await fetchTextWithBackgroundFallback(captionUrl.toString());
    xmlText = xmlResponse.body || '';
    if (xmlText.trim()) {
      sawCaptionBody = true;
    } else {
      parseFailures.push('xml response was empty');
    }
  } catch (error) {
    console.warn('[Page Copilot] Failed to fetch YouTube XML captions:', error);
    failures.push(`xml fetch failed: ${error.message}`);
    return {
      payload: null,
      diagnostic: buildYouTubeTranscriptDiagnostic('caption fetch failed', {
        language: track.languageCode || '',
        failures,
        parseFailures
      })
    };
  }

  const text = xmlText.trim() ? parseYouTubeXmlTranscript(xmlText) : '';
  const cues = xmlText.trim() ? parseYouTubeXmlCues(xmlText) : [];
  if (!text) {
    const reason = failures.length && !sawCaptionBody ? 'caption fetch failed' : 'caption parse failed';
    return {
      payload: null,
      diagnostic: buildYouTubeTranscriptDiagnostic(reason, {
        language: track.languageCode || '',
        failures,
        parseFailures
      })
    };
  }

  return {
    payload: {
      text,
      download: buildTranscriptDownload({
        platform: 'YouTube',
        title: document.title,
        language: track.languageCode || '',
        body: buildWebVtt(cues)
      })
    },
    diagnostic: null
  };
}

/**
 * Fetch readable text and download metadata from YouTube's transcript panel.
 * @param {object} initialData YouTube initial data object.
 * @param {string} language Preferred language code.
 * @returns {object|null} Transcript payload, or null when unavailable.
 */
function fetchYouTubeTranscriptPanelPayload(initialData, language) {
  const cues = parseYouTubeTranscriptPanelCues(initialData);
  const text = cues
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  return {
    text,
    download: buildTranscriptDownload({
      platform: 'YouTube',
      title: document.title,
      language,
      body: buildWebVtt(cues)
    })
  };
}

/**
 * Fetch transcript text for the current YouTube video when captions are available.
 * @returns {Promise<object|null>} Transcript content object, or null when unavailable.
 */
async function extractYouTubeTranscriptContent() {
  const videoId = getYouTubeVideoId();
  let playerResponse = window.ytInitialPlayerResponse
    || readInlineJsonObject(['ytInitialPlayerResponse =', 'ytInitialPlayerResponse=']);
  let diagnostic = null;

  if (!playerResponse) {
    playerResponse = await fetchYouTubeAndroidPlayerResponse(videoId);
  }

  if (!playerResponse) {
    const initialData = window.ytInitialData
      || readInlineJsonObject(['ytInitialData =', 'ytInitialData=']);
    const panelPayload = fetchYouTubeTranscriptPanelPayload(initialData, '');
    if (panelPayload?.text) {
      return {
        title: document.title,
        url: location.href,
        text: panelPayload.text,
        textLength: panelPayload.text.length,
        excerpt: panelPayload.text.substring(0, 500) + (panelPayload.text.length > 500 ? '...' : ''),
        contentType: 'videoTranscript',
        sourceName: 'YouTube captions',
        language: '',
        download: panelPayload.download
      };
    }

    return buildYouTubeTranscriptDiagnostic('no player response', {
      hasVideoId: !!videoId,
      hasInnertubeApiKey: !!getYouTubeInnertubeApiKey(),
      hasInitialData: !!initialData
    });
  }

  let track = selectYouTubeCaptionTrack(playerResponse);
  let selectedLanguage = track?.languageCode || '';
  let captionResult = { payload: null, diagnostic: null };
  let payload = null;

  if (track) {
    captionResult = await fetchYouTubeCaptionPayload(track);
    payload = captionResult.payload;
    diagnostic = captionResult.diagnostic;
  } else {
    diagnostic = buildYouTubeTranscriptDiagnostic('no caption tracks', {
      hasPlayerResponse: true,
      captionTrackCount: 0
    });
  }

  if (!payload?.text) {
    const androidPlayerResponse = await fetchYouTubeAndroidPlayerResponse(videoId);
    playerResponse = androidPlayerResponse || playerResponse;
    track = selectYouTubeCaptionTrack(playerResponse);
    selectedLanguage = track?.languageCode || selectedLanguage;
    if (track) {
      captionResult = await fetchYouTubeCaptionPayload(track);
      payload = captionResult.payload;
      diagnostic = captionResult.diagnostic || diagnostic;
    }
  }

  if (!payload?.text) {
    const initialData = window.ytInitialData
      || readInlineJsonObject(['ytInitialData =', 'ytInitialData=']);
    payload = fetchYouTubeTranscriptPanelPayload(initialData, selectedLanguage);
  }

  if (!payload?.text) {
    return diagnostic || buildYouTubeTranscriptDiagnostic('no caption tracks', {
      hasPlayerResponse: !!playerResponse,
      captionTrackCount: playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length || 0
    });
  }

  return {
    title: document.title,
    url: location.href,
    text: payload.text,
    textLength: payload.text.length,
    excerpt: payload.text.substring(0, 500) + (payload.text.length > 500 ? '...' : ''),
    contentType: 'videoTranscript',
    sourceName: 'YouTube captions',
    language: selectedLanguage,
    download: payload.download
  };
}

/**
 * Read Bilibili play state from inline scripts.
 * @returns {{playInfo: object|null, initialState: object|null}} Bilibili page state.
 */
function readBilibiliState() {
  return {
    playInfo: readInlineJsonObject(['window.__playinfo__=', 'window.__playinfo__ =']),
    initialState: readInlineJsonObject(['window.__INITIAL_STATE__=', 'window.__INITIAL_STATE__ ='])
  };
}

/**
 * Read the current Bilibili BV id from page state or URL.
 * @param {object|null} initialState Existing Bilibili initial state.
 * @returns {string} Bilibili BV id.
 */
function getBilibiliBvid(initialState) {
  return initialState?.videoData?.bvid
    || initialState?.bvid
    || location.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)?.[1]
    || '';
}

/**
 * Fetch Bilibili video metadata when isolated content scripts cannot read
 * the page's JavaScript globals.
 * @param {string} bvid Bilibili BV id.
 * @returns {Promise<object|null>} Bilibili video metadata.
 */
async function fetchBilibiliViewData(bvid) {
  if (!bvid) return null;

  const apiUrl = new URL('/x/web-interface/view', 'https://api.bilibili.com');
  apiUrl.searchParams.set('bvid', bvid);

  const { body } = await fetchTextWithBackgroundFallback(apiUrl.toString());
  const data = JSON.parse(body);
  return data?.data || null;
}

/**
 * Resolve the Bilibili identifiers required by the player subtitle API.
 * @param {object|null} playInfo Existing Bilibili play info.
 * @param {object|null} initialState Existing Bilibili initial state.
 * @returns {Promise<{cid: number|string, bvid: string}>} Bilibili identifiers.
 */
async function getBilibiliVideoIds(playInfo, initialState) {
  const bvid = getBilibiliBvid(initialState);
  const inlineCid = initialState?.videoData?.cid
    || initialState?.cid
    || playInfo?.data?.cid
    || playInfo?.data?.last_play_cid;

  if (inlineCid && bvid) {
    return { cid: inlineCid, bvid };
  }

  const viewData = await fetchBilibiliViewData(bvid);
  return {
    cid: inlineCid || viewData?.cid || viewData?.pages?.[0]?.cid || '',
    bvid: bvid || viewData?.bvid || ''
  };
}

/**
 * Check whether a Bilibili subtitle track has a readable subtitle URL.
 * @param {object} track Bilibili subtitle track metadata.
 * @returns {boolean} Whether the track can be fetched.
 */
function hasBilibiliSubtitleUrl(track) {
  return Boolean(track?.subtitle_url || track?.subtitleUrl);
}

/**
 * Collect subtitle entries from Bilibili state or player API.
 * @param {object|null} playInfo Existing Bilibili play info.
 * @param {object|null} initialState Existing Bilibili initial state.
 * @returns {Promise<object[]>} Subtitle track entries.
 */
async function getBilibiliSubtitleTracks(playInfo, initialState) {
  const inlineTracks = playInfo?.data?.subtitle?.subtitles
    || playInfo?.data?.subtitle?.subtitles_list
    || initialState?.videoData?.subtitle?.list
    || [];
  const usableInlineTracks = inlineTracks.filter(hasBilibiliSubtitleUrl);
  if (usableInlineTracks.length) return usableInlineTracks;

  const { cid, bvid } = await getBilibiliVideoIds(playInfo, initialState);
  if (!cid || !bvid) return [];

  const apiUrl = new URL('/x/player/v2', 'https://api.bilibili.com');
  apiUrl.searchParams.set('cid', cid);
  apiUrl.searchParams.set('bvid', bvid);

  const { body } = await fetchTextWithBackgroundFallback(apiUrl.toString());
  const data = JSON.parse(body);
  const apiTracks = data?.data?.subtitle?.subtitles || data?.data?.subtitle?.list || [];
  return apiTracks.filter(hasBilibiliSubtitleUrl);
}

/**
 * Convert Bilibili subtitle JSON into timed subtitle cues.
 * @param {object} data Bilibili subtitle payload.
 * @returns {{startMs: number, endMs: number, text: string}[]} Timed subtitle cues.
 */
function parseBilibiliSubtitleCues(data) {
  return (data.body || []).map((item) => {
    const startMs = Math.round((Number(item.from) || 0) * 1000);
    const endMs = Math.round((Number(item.to) || 0) * 1000);

    return {
      startMs,
      endMs: endMs > startMs ? endMs : startMs + 1,
      text: (item.content || '').replace(/\s+/g, ' ').trim()
    };
  }).filter((cue) => cue.text);
}

/**
 * Convert Bilibili subtitle JSON into readable transcript text.
 * @param {object} data Bilibili subtitle payload.
 * @returns {string} Transcript text.
 */
function parseBilibiliSubtitle(data) {
  return parseBilibiliSubtitleCues(data)
    .map((cue) => cue.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch transcript text for the current Bilibili video when subtitles are available.
 * @returns {Promise<object|null>} Transcript content object, or null when unavailable.
 */
async function extractBilibiliTranscriptContent() {
  const { playInfo, initialState } = readBilibiliState();
  const tracks = await getBilibiliSubtitleTracks(playInfo, initialState);
  const track = tracks.find((item) => item.lan?.startsWith('zh'))
    || tracks.find((item) => item.lan?.startsWith('en'))
    || tracks[0];

  const rawSubtitleUrl = track?.subtitle_url || track?.subtitleUrl;
  if (!rawSubtitleUrl) return null;

  const { body: rawBody } = await fetchTextWithBackgroundFallback(normalizeSubtitleUrl(rawSubtitleUrl));
  const data = JSON.parse(rawBody);
  const text = parseBilibiliSubtitle(data);
  const cues = parseBilibiliSubtitleCues(data);
  if (!text) return null;

  return {
    title: document.title,
    url: location.href,
    text,
    textLength: text.length,
    excerpt: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
    contentType: 'videoTranscript',
    sourceName: 'Bilibili subtitles',
    language: track.lan || '',
    download: buildTranscriptDownload({
      platform: 'Bilibili',
      title: document.title,
      language: track.lan || '',
      body: buildWebVtt(cues)
    })
  };
}

/**
 * Extract transcript content for supported video pages.
 * @returns {Promise<object|null>} Transcript content object, or null for unsupported pages.
 */
async function extractVideoTranscriptContent() {
  const hostname = location.hostname;

  try {
    if (hostname.includes('youtube.com') && location.pathname === '/watch') {
      return await extractYouTubeTranscriptContent();
    }

    if (hostname.includes('bilibili.com') && /^\/video\//.test(location.pathname)) {
      return await extractBilibiliTranscriptContent();
    }
  } catch (error) {
    console.warn('[Page Copilot] Failed to extract video transcript:', error);
  }

  return null;
}

window.PageCopilotTranscript = {
  extractVideoTranscriptContent
};
