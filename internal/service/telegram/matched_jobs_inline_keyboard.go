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
var MATCHED_JOBS_TOTAL_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "total_page_"
var MATCHED_JOBS_NEXT_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "next_page"
var MATCHED_JOBS_PRE_PAGE_DATA = MATCHED_JOBS_CALLBACK_DATA_PREFIX + "pre_page"

var NOTIFY_MATCHED_JOBS_CALLBACK_DATA_PREFIX = "notify_matched_jobs_callback_data_"
var NOTIFY_MATCHED_JOBS_CURRENT_PAGE_DATA = NOTIFY_MATCHED_JOBS_CALLBACK_DATA_PREFIX + "current_page_"
var NOTIFY_MATCHED_JOBS_TOTAL_PAGE_DATA = NOTIFY_MATCHED_JOBS_CALLBACK_DATA_PREFIX + "total_page_"
var NOTIFY_MATCHED_JOBS_NEXT_PAGE_DATA = NOTIFY_MATCHED_JOBS_CALLBACK_DATA_PREFIX + "next_page"
var NOTIFY_MATCHED_JOBS_PRE_PAGE_DATA = NOTIFY_MATCHED_JOBS_CALLBACK_DATA_PREFIX + "pre_page"

func buildMatchedJobListInlineKeyboard(ctx context.Context, userId string, update *models.Update) (replyMarkup models.ReplyMarkup, replyMessage string, err error) {

	var currentPage int = 0
	// event from callback button, update inline keyboard
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
	matchJobList, err := dao.GetUserMatchedJobDetailList(ctx, userId, offset, limit)
	if err != nil {
		g.Log().Line().Error(ctx, "get latest job list error : ", err)
		return
	}

	for _, job := range matchJobList {
		replyMessage = replyMessage + fmt.Sprintf("Title : %s\nLink : %s\nLocation : %s\nSalary : %s\nDate : %s\n\n", job.Title, job.Link, job.Location, job.Salary, job.UpdateTime.Format("Y-m-d"))
	}

	if replyMessage == "" {
		replyMessage = "No matched job found, please try again later."
	}

	matchJobTotalCount, err := dao.GetUserMatchedJobDetailListTotalCount(ctx, userId)
	if err != nil {
		g.Log().Line().Error(ctx, "get matched job total count error : ", err)
		return
	}

	totalPage := calculateTotalPages(matchJobTotalCount, limit)

	replyMarkup = &models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "Current Page " + gconv.String(currentPage+1), CallbackData: MATCHED_JOBS_CURRENT_PAGE_DATA + gconv.String(currentPage)},
			},
			{
				{Text: "Total Page " + gconv.String(totalPage), CallbackData: MATCHED_JOBS_TOTAL_PAGE_DATA + gconv.String(totalPage)},
			},
			{
				{Text: "Pre Page", CallbackData: MATCHED_JOBS_PRE_PAGE_DATA},
				{Text: "Next Page", CallbackData: MATCHED_JOBS_NEXT_PAGE_DATA},
			},
		},
	}

	return
}

func BuildMatchedJobListNotificationInlineKeyboard(ctx context.Context, telegramId string, update *models.Update) (replyMarkup models.ReplyMarkup, replyMessage string, err error) {
	var currentPage int = 0
	// event from callback button, update inline keyboard
	if update != nil && update.CallbackQuery != nil {
		updateReplyMarkup := update.CallbackQuery.Message.Message.ReplyMarkup
		for _, inlineKeyboard := range updateReplyMarkup.InlineKeyboard {
			if gstr.HasPrefix(inlineKeyboard[0].CallbackData, NOTIFY_MATCHED_JOBS_CURRENT_PAGE_DATA) {
				currentPageStr := gstr.TrimLeftStr(inlineKeyboard[0].CallbackData, NOTIFY_MATCHED_JOBS_CURRENT_PAGE_DATA)
				currentPage = gconv.Int(currentPageStr)
				break
			}
		}

		if update.CallbackQuery.Data == NOTIFY_MATCHED_JOBS_PRE_PAGE_DATA {
			if currentPage >= 1 {
				currentPage = currentPage - 1
			}
		} else if update.CallbackQuery.Data == NOTIFY_MATCHED_JOBS_NEXT_PAGE_DATA {
			currentPage = currentPage + 1
		}
	}

	limit := 10
	offset := currentPage * limit
	userInfo, err := dao.GetUserInfoByTelegramId(ctx, telegramId)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get user %s info failed : %v", telegramId, err)
		replyMessage = "There is something wrong with my service. Please try again later."
		return
	}
	userNonNotifiedCount, err := dao.GetUserNonNotifiedJobTotalCount(ctx, userInfo.Id)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get user %s non notified job total count failed : %v", userInfo.Id, err)
		return
	}
	if userNonNotifiedCount == 0 {
		return
	} else if offset >= userNonNotifiedCount {
		replyMessage = "No more matched job."
	}

	userMatchJobList, err := dao.GetUserNonNotifiedJobList(ctx, userInfo.Id, offset, limit)
	if err != nil {
		g.Log().Line().Errorf(ctx, "get user %s non notified job list failed : %v", userInfo.Id, err)
		return
	}
	for _, job := range userMatchJobList {
		replyMessage = replyMessage + fmt.Sprintf("Title : %s\nLink : %s\nLocation : %s\nSalary : %s\nDate : %s\n\n", job.Title, job.Link, job.Location, job.Salary, job.UpdateTime.Format("Y-m-d"))
	}

	if replyMessage == "" {
		replyMessage = "No matched job found, please try again later."
	}

	nonNotifiedMatchJobTotalCount, err := dao.GetUserNonNotifiedJobTotalCount(ctx, userInfo.Id)
	if err != nil {
		g.Log().Line().Error(ctx, "get matched job total count error : ", err)
		return
	}

	totalPage := calculateTotalPages(nonNotifiedMatchJobTotalCount, limit)

	replyMarkup = &models.InlineKeyboardMarkup{
		InlineKeyboard: [][]models.InlineKeyboardButton{
			{
				{Text: "Current Page " + gconv.String(currentPage+1), CallbackData: NOTIFY_MATCHED_JOBS_CURRENT_PAGE_DATA + gconv.String(currentPage)},
			},
			{
				{Text: "Total Page " + gconv.String(totalPage), CallbackData: NOTIFY_MATCHED_JOBS_TOTAL_PAGE_DATA + gconv.String(totalPage)},
			},
			{
				{Text: "Pre Page", CallbackData: NOTIFY_MATCHED_JOBS_PRE_PAGE_DATA},
				{Text: "Next Page", CallbackData: NOTIFY_MATCHED_JOBS_NEXT_PAGE_DATA},
			},
		},
	}
	return
}

func calculateTotalPages(totalCount, pageSize int) int {
	if totalCount%pageSize == 0 {
		return totalCount / pageSize
	}
	return (totalCount / pageSize) + 1
}