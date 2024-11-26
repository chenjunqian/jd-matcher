// =================================================================================
// Code generated and maintained by GoFrame CLI tool. DO NOT EDIT.
// =================================================================================

package entity

// JobDetail is the golang structure for table job_detail.
type JobDetail struct {
	Id       string   `json:"id"       orm:"id"       description:""` //
	Title    string   `json:"title"    orm:"title"    description:""` //
	JobDesc  string   `json:"jobDesc"  orm:"job_desc" description:""` //
	JobTags  []string `json:"jobTags"  orm:"job_tags" description:""` //
	Link     string   `json:"link"     orm:"link"     description:""` //
	Source   string   `json:"source"   orm:"source"   description:""` //
	Location string   `json:"location" orm:"location" description:""` //
	Salary   string   `json:"salary"   orm:"salary"   description:""` //
}
