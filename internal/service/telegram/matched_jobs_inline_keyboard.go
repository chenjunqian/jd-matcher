package telegram

import (
	"context"
	"fmt"
	"jd-matcher/internal/dao"

	"github.com/go-telegram/bot/models"
	"github.com/gogf/gf/v2/frame/g"
	"github.com/gogf/gf/v2/text/gstr"
	"github.com/gogf/gf/v2/util/gconv"
)

var MATCHED_JOBS_CALLBACK_DATA_PREFIX = "matched_jobs_callback_data_"
var MATCHED_JOBS_CURRENT_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "current_page_"
var MATCHED_JOBS_NEXT_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "next_page"
var MATCHED_JOBS_PRE_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "pre_page"

func buildMatchedJobListInlineKeyboard(ctx context.Context, update *models.Update) (replyMarkup models.ReplyMarkup, replyMessage string, err error) {

	var currentPage int = 0
	if update.CallbackQuery != nil {
		updateReplyMarkup := update.CallbackQuery.Message.Message.ReplyMarkup
		for _, inlineKeyboard := range updateReplyMarkup.InlineKeyboard {
			if gstr.HasPrefix(inlineKeyboard[0].CallbackData, MATCHED_JOBS_CURRENT_PAGE_DATA) {
				currentPageStr := gstr.TrimLeftStr(inlineKeyboard[0].CallbackData, MATCHED_JOBS_CURRENT_PAGE_DATA)
				currentPage = gconv.Int(currentPageStr)
				break
			}
		}

		if update.CallbackQuery.Data == MATCHED_JOBS_PRE_PAGE_DATA {
			if currentPage >= 1 {
				currentPage = currentPage - 1
			}
		} else if update.CallbackQuery.Data == MATCHED_JOBS_NEXT_PAGE_DATA {
			currentPage = currentPage + 1
		}
	}

	limit := 10
	offset := currentPage * limit
	latestJobList, err := dao.GetLatestJobList(ctx, offset, limit)
	if err != nil {
		g.Log().Line().Error(ctx, "get latest job list error : ", err)
		return
	}

	for _, job := range latestJobList {
		replyMessage = replyMessage + fmt.Sprintf("Title : %s\nLink : %s\nDate : %s\n\n", job.Title, job.Link, job.UpdateTime.Format("Y-m-d"))
	}

	replyMarkup = &models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "Current Page " + gconv.String(currentPage + 1), CallbackData: MATCHED_JOBS_CURRENT_PAGE_DATA + gconv.String(currentPage)},
			},
			{
				{Text: "Pre Page", CallbackData: MATCHED_JOBS_PRE_PAGE_DATA},
				{Text: "Next Page", CallbackData: MATCHED_JOBS_NEXT_PAGE_DATA},
			},
		},
	}

	return
}
