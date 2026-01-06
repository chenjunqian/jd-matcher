package all_jobs

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
)

func CallbackHandler(ctx context.Context, b *bot.Bot, update *models.Update) {
	Callback(ctx, b, update)
}

func Callback(ctx context.Context, b *bot.Bot, update *models.Update) {
	g.Log().Line().Debugf(ctx, "update: %v", update)
	replyMarkup, replyMessage, err := BuildKeyboard(ctx, update)
	if err != nil {
		g.Log().Line().Error(ctx, "build all job list inline keyboard error : ", err)
		return
	}

	respMsg, err := b.EditMessageText(ctx, &bot.EditMessageTextParams{
		ChatID:      update.CallbackQuery.Message.Message.Chat.ID,
		MessageID:   update.CallbackQuery.Message.Message.ID,
		Text:        replyMessage,
		ReplyMarkup: replyMarkup,
	})

	if err != nil {
		g.Log().Line().Error(ctx, "edit message error : ", err)
		g.Log().Line().Error(ctx, "edit failed response message : %v", respMsg)
	}
}

// HandleTextInput handles text input after /all_jobs command
func HandleTextInput(ctx context.Context, b *bot.Bot, update *models.Update) {
	// All jobs doesn't have text input handling currently
}
