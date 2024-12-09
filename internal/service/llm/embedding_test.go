package llm

import (
	"context"
	"testing"
)

func TestEmbeddingText(t *testing.T) {
	type args struct {
		ctx      context.Context
		contents []string
	}
	tests := []struct {
		name string
		args args
	}{
		{
			name: "openai embedding text",
			args: args{
				ctx:      context.Background(),
				contents: []string{"You are a company branding design wizard.", "What would be a good company name a company that makes colorful socks?"},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := InitOpenAIClient(tt.args.ctx)
			if err != nil {
				return
			}
			gotVector, err := llmClient.EmbeddingText(tt.args.ctx, tt.args.contents)
			if err != nil {
				t.Log(err)
				return
			}
			if len(gotVector) != 2 {
				t.Errorf("EmbeddingText() = %v, want %v", gotVector, 2)
			}
			t.Logf("EmbeddingText() = %v", gotVector)
		})
	}
}