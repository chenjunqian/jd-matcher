package telegram

import (
	"context"

	"github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/util/gconv"
)

func resumeMatchCallbackHandler(ctx context.Context, b *bot.Bot, update *models.Update) {
}

func matchedJobsCallbackHandler(ctx context.Context, b *bot.Bot, update *models.Update) {
	g.Log().Line().Debugf(ctx, "update: %v", gconv.String(update))
	replyMarkup, replyMessage, err := buildMatchedJobListInlineKeyboard(ctx, update)
	if err != nil {
		g.Log().Line().Error(ctx, "build matched job list inline keyboard error : ", err)
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
		g.Log().Line().Error(ctx, "edit failed response message : ", gconv.String(respMsg))
	}
}
