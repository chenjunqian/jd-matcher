package help

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
)

func Handle(ctx context.Context, b *bot.Bot, update *models.Update) {
	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID: update.Message.Chat.ID,
		Text:   "Use /upload_resume to upload your resume first.\nThen you can use /jobs to get all available jobs for you.",
	})
}

// HandleTextInput handles text input after /help command
func HandleTextInput(ctx context.Context, b *bot.Bot, update *models.Update) {
	// Help command doesn't expect text input
}
