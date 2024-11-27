// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

// UserInfo is the golang structure for table user_info.
type UserInfo struct {
	Id              string    `json:"id"              orm:"id"               description:""` //
	Name            string    `json:"name"            orm:"name"             description:""` //
	Email           string    `json:"email"           orm:"email"            description:""` //
	TelegramId      string    `json:"telegramId"      orm:"telegram_id"      description:""` //
	ResumeEmbedding []float32 `json:"resumeEmbedding" orm:"resume_embedding" description:""` //
	Resume          string    `json:"resume"          orm:"resume"           description:""` //
}
