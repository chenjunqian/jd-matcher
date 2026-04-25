package llm

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
)

type reasoningEffortTransport struct {
	base            http.RoundTripper
	reasoningEffort string
}

func NewReasoningEffortTransport(base http.RoundTripper, reasoningEffort string) http.RoundTripper {
	return &reasoningEffortTransport{
		base:            base,
		reasoningEffort: reasoningEffort,
	}
}

func (t *reasoningEffortTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if req.Method != http.MethodPost {
		return t.base.RoundTrip(req)
	}

	body, err := io.ReadAll(req.Body)
	req.Body.Close()
	if err != nil {
		return t.base.RoundTrip(req)
	}

	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return t.base.RoundTrip(req)
	}

	if _, ok := payload["reasoning_effort"]; ok {
		req.Body = io.NopCloser(bytes.NewReader(body))
		return t.base.RoundTrip(req)
	}

	payload["reasoning_effort"] = t.reasoningEffort

	newBody, err := json.Marshal(payload)
	if err != nil {
		return t.base.RoundTrip(req)
	}

	req.Body = io.NopCloser(bytes.NewReader(newBody))
	req.ContentLength = int64(len(newBody))

	return t.base.RoundTrip(req)
}
