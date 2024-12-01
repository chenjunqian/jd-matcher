package llm

import (
	"context"

	"github.com/tmc/langchaingo/llms"
)


func GenerateMatchJobByResumeResult(ctx context.Context, prompt string) (result string, err error) {

	result, err = llms.GenerateFromSinglePrompt(
		ctx, 
		openAIClient, 
		prompt,
		llms.WithJSONMode(),
	)

	return
}
