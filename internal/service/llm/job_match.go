package llm

import (
	"context"

	"github.com/tmc/langchaingo/llms"
)


func (c *LLMClient) GenerateMatchJobByResumeResult(ctx context.Context, prompt string) (result string, err error) {

	result, err = llms.GenerateFromSinglePrompt(
		ctx, 
		llmClient.Client, 
		prompt,
		llms.WithJSONMode(),
	)

	return
}
