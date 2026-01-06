package all_jobs

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
)

func Handle(ctx context.Context, b *bot.Bot, update *models.Update) {
	replyMarkup, replyMessage, err := BuildKeyboard(ctx, update)
	if err != nil {
		g.Log().Line().Error(ctx, "build all jobs inline keyboard error : ", err)
		return
	}

	b.SendMessage(ctx, &bot.SendMessageParams{
		ChatID:      update.Message.Chat.ID,
		Text:        replyMessage,
		ReplyMarkup: replyMarkup,
	})
}
